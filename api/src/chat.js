const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { sendMessageReceivedEmail, sendSpamAlertEmail, sendChatBlockedEmail } = require('./mail');
const { db, auth, getFunctionUrl } = require('./firebase');
const {
  chatsCol,
  chatsDoc,
  usersDoc,
  usersPrivateDoc,
  usersMetaDoc,
  statsDoc,
  messagesDoc,
  pushRegistrationsCol,
  unreadsDoc
} = require('./collections');
const { sendNotification } = require('./push');
const fail = require('./util/fail');
const { supabase } = require('./supabase');
const { getFunctions } = require('firebase-admin/functions');
const { FirebaseMessagingError } = require('firebase-admin/messaging');
const { normalizeMessage, buildMessageUrl } = require('./util/mail');
const { shouldReplicateRuntime } = require('./sharedConfig');
const { HttpsError } = require('firebase-functions/v2/https');

exports.MAX_MESSAGE_LENGTH = 800;

const MAX_CHATS_PER_DAY = 100;

const getChat = async (chatId) => {
  const doc = await chatsDoc(chatId).get();
  if (!doc.exists) {
    throw new Error(`Email error: the chat with ID ${chatId} doesn't exist`);
  }
  const chat = doc.data();
  return /** @type {LocalChat} */ ({
    id: doc.id,
    ...chat
  });
};

/**
 * Sends an email notification of a new chat to a recipient, if the recipient
 * wishes to receive email notifications and has not received a notification about the
 * chat yet very recently.
 *
 * @param {FirestoreEvent<QueryDocumentSnapshot<import('../../src/lib/types/Chat').FirebaseMessage>,
 * { chatId: string; messages: string; messageId: string; }>} snap
 * @returns {Promise<any>}
 */
exports.onMessageCreate = async ({ data: snap, params }) => {
  const message = snap.data();
  const senderId = message.from;
  const { chatId } = params;

  const chat = await getChat(chatId);

  const recipientId = chat.users.find((uid) => senderId !== uid);
  if (!recipientId) {
    logger.error(`Couldn't find the UID of the recipient of message ${snap.id} in chat ${chat.id}`);
    return;
  }
  const recipientUserPrivateDocRef = usersPrivateDoc(recipientId);
  const unreadDoc = await unreadsDoc(recipientId, chatId).get();

  await statsDoc('messages').set({ count: FieldValue.increment(1) }, { merge: true });

  const recipientUserPrivateDocData = /** @type {UserPrivate} */ (
    (await recipientUserPrivateDocRef.get()).data()
  );
  if (!recipientUserPrivateDocData) {
    logger.warn(
      "Could not retrieve the recipient's private document data. The recipient is likely deleted, aborting.",
      {
        messageId: snap.id,
        recipientId
      }
    );
    return;
  }

  const recipientUserPublicDocData = /** @type {UserPublic} */ (
    (await usersDoc(recipientId).get()).data()
  );
  if (!recipientUserPublicDocData) {
    logger.error("Could not retrieve the recipient's public document data. Aborting.");
    return;
  }

  // If the recipient had archived the chat, unarchive it so the new message surfaces
  if (Array.isArray(chat.archivedBy) && chat.archivedBy.includes(recipientId)) {
    try {
      await chatsDoc(chatId).update({
        archivedBy: FieldValue.arrayRemove(recipientId)
      });
    } catch (e) {
      logger.error('Could not unarchive a chat that received a new message for the recipient', {
        chatId: chat.id
      });
    }
  }

  const recipientEmailPreferences = recipientUserPrivateDocData.emailPreferences;

  // Determine whether an email should be sent,
  // based on user preferences + recency
  /** @type {boolean} */
  let shouldNotifyEmail = recipientEmailPreferences.newChat || true;
  if (shouldNotifyEmail && unreadDoc.exists) {
    const unread = unreadDoc.data();
    const nowDate = new Date();
    // Elapsed time since last email notification in milliseconds
    const elapsedTime = nowDate.getTime() - unread.notifiedAt.toMillis();
    // user was notified in the last 5 mins
    if (elapsedTime / 60000 <= 5) {
      shouldNotifyEmail = false;
    }
  }

  // Send email and/or push notifications
  try {
    const recipientAuthUser = await auth.getUser(recipientId);

    if (!recipientAuthUser.email || !recipientAuthUser.displayName) {
      logger.error(`Email or display name of ${recipientId} are not valid`);
      fail('internal');
    }

    const senderAuthUser = await auth.getUser(senderId);

    if (!senderAuthUser || !senderAuthUser.displayName) {
      logger.error(`Sender auth user ${senderId} or its displayName is undefined/null`);
      fail('internal');
    }

    // Compute the recipient's unread chat count for the iOS badge
    // We count 1 for the current chat (always unseen for the recipient at this point —
    // the client updates lastMessageSeen after creating the message, so there's a race),
    // plus any other chats already marked unseen.
    let recipientUnreadCount = 1;
    try {
      const recipientChatsSnap = await chatsCol()
        .where('users', 'array-contains', recipientId)
        .get();
      for (const chatDoc of recipientChatsSnap.docs) {
        if (chatDoc.id === chatId) continue;
        const d = chatDoc.data();
        if (d.lastMessageSeen === false && d.lastMessageSender !== recipientId) {
          recipientUnreadCount++;
        }
      }
    } catch (ex) {
      logger.error('Error while computing recipient unread count for badge', ex);
    }

    const recipientLanguage = recipientUserPrivateDocData.communicationLanguage ?? 'en';
    const commonPayload = {
      senderName: senderAuthUser.displayName ?? '',
      message: normalizeMessage(message.content),
      messageUrl: buildMessageUrl({
        displayName: senderAuthUser.displayName,
        chatId,
        language: recipientLanguage
      }),
      superfan: recipientUserPublicDocData.superfan ?? false,
      language: recipientLanguage,
      recipientUnreadCount,
      threadId: chatId
    };
    //
    // In any case: send a notification to all registered devices via FCM
    try {
      const pushRegistrationRef = pushRegistrationsCol(recipientId);
      const pushRegistrations = (await pushRegistrationRef.get()).docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));

      await Promise.all(
        pushRegistrations
          .filter((pR) => pR.status === 'active')
          .map(async (pR) => {
            const { id, fcmToken } = pR;
            // `host` only exists on web-push registrations; undefined for native.
            const host = 'host' in pR ? pR.host : undefined;
            try {
              return await sendNotification({
                ...commonPayload,
                // Override the messageUrl with the host from the push registration, so it also works for beta.welcometomygarden.org.
                // Firebase's JS SDK filters out non-matching hosts on click events in their service worker code
                // probably with reason, because: https://developer.mozilla.org/en-US/docs/Web/API/Clients/openWindow#parameters :
                //   > A string representing the URL of the client you want to open in the window.
                //   > **Generally this value must be a URL from the same origin as the calling script.**
                messageUrl: buildMessageUrl({
                  displayName: senderAuthUser.displayName,
                  chatId,
                  host,
                  language: recipientLanguage
                }),
                fcmToken
              });
            } catch (pushNotificationError) {
              if (
                pushNotificationError instanceof FirebaseMessagingError &&
                pushNotificationError.code === 'messaging/registration-token-not-registered'
              ) {
                // https://firebase.google.com/docs/cloud-messaging/manage-tokens#detect-invalid-token-responses-from-the-fcm-backend
                // "warn" because this is an expected, fairly normal error condition
                logger.warn(
                  'FCM token registration error after trying to send a push notification',
                  {
                    id,
                    recipientId: recipientAuthUser.uid,
                    fcmToken
                  }
                );
                // TODO: remove this registration? Let's try to see if we can leverage the endpoint directly?
                try {
                  // Mark this registration as errored
                  await pushRegistrationsCol(recipientAuthUser.uid)
                    .doc(id)
                    .update({
                      status: /** @type {PushRegistrationStatus} */ ('fcm_errored'),
                      erroredAt: Timestamp.now()
                    });
                } catch (registrationUpdateError) {
                  logger.error(
                    'Error updating a push registration to an errored status',
                    registrationUpdateError,
                    {
                      id,
                      recipientId: recipientAuthUser.uid,
                      fcmToken
                    }
                  );
                }
              } else {
                logger.error('Unknown push registration error', pushNotificationError);
              }
            }
          })
      );
    } catch (ex) {
      logger.error('Error while sending push notification: ', ex);
    }

    // Send email, if the last email wasn't sent too recently
    if (shouldNotifyEmail) {
      try {
        // Mark new email activity, to determine email recency next time
        await unreadsDoc(recipientId, chatId).set({
          notifiedAt: FieldValue.serverTimestamp(),
          chatId
        });

        await sendMessageReceivedEmail({
          ...commonPayload,
          email: recipientAuthUser.email,
          firstName: recipientAuthUser.displayName
        });
      } catch (ex) {
        logger.error('Error while sending email notification: ', ex);
      }
    }
  } catch (ex) {
    logger.error(ex);
  }
};

/**
 * @param {FirestoreAuthEvent<QueryDocumentSnapshot<Chat>, { chatId: string; }>} event
 */
exports.onChatCreate = async ({ data: chatSnapshot }) => {
  const chatId = chatSnapshot.id;

  // To continue processing, a chat has to be created by a user
  // (always true, at least in our current system)
  //
  // TODO: authId as a param ot the event probably exists in production (and would be better to use),
  // but it is not testable https://github.com/firebase/firebase-tools/issues/7450
  const [senderAuthId, recipientAuthId] = chatSnapshot.data().users;
  if (typeof senderAuthId !== 'string') {
    fail('not-found');
  }

  const senderMetaRef = usersMetaDoc(senderAuthId);
  const { chatWindowStartAt, chatWindowCount, chatBlockedAt } =
    (await senderMetaRef.get()).data() ?? {};
  if (chatBlockedAt) {
    logger.error(
      'Handling a new chat after the sender was blocked from new chats. `createChat` should prevent this.',
      {
        chatId,
        senderAuthId,
        recipientAuthId
      }
    );
    fail('permission-denied');
  }

  await statsDoc('chats').set({ count: FieldValue.increment(1) }, { merge: true });

  // Enqueue message reminder email, if the recipient has not opted out manually (hardcoded for now)
  if (!['tgnSZm4dzpX24DZBHfIYzAvNGH02'].includes(recipientAuthId)) {
    const [resourceName, targetUri] = await getFunctionUrl('sendMessage');
    /**
     * @type {TaskQueue<QueuedMessage>}
     */
    const sendMessageQueue = getFunctions().taskQueue(resourceName);
    await sendMessageQueue.enqueue(
      {
        type: 'message_reminder',
        data: {
          chatId: chatId,
          senderUid: senderAuthId
        }
      },
      {
        scheduleDelaySeconds: 24 * 3600,
        ...(targetUri
          ? {
              uri: targetUri
            }
          : {})
      }
    );
  }

  // TODO: refactor the spam alert to be managed in users-meta
  const now = Date.now();
  const userPrivateDocRef = usersPrivateDoc(senderAuthId);
  const userPrivateSnap = await userPrivateDocRef.get();
  const usersPrivateDocData = userPrivateSnap.data();
  const canCheckForSpamActivity =
    usersPrivateDocData &&
    (!usersPrivateDocData.latestSpamAlertAt ||
      now - usersPrivateDocData.latestSpamAlertAt.toMillis() > 24 * 3600 * 1000);

  async function getChatNotificationParamsForSender() {
    const { email, displayName } = await auth.getUser(senderAuthId);
    if (!usersPrivateDocData) {
      throw new Error('users-private doc is falsy while getting chat notification params');
    }
    return {
      uid: senderAuthId,
      email: /** @type {string} */ (email),
      firstName: /** @type {string} */ (displayName),
      lastName: usersPrivateDocData.lastName,
      secret: usersPrivateDocData.secret,
      lastMessage: chatSnapshot.data().lastMessage
    };
  }

  async function checkForSpamActivity() {
    // Get all the chats involving the user
    const chatsOfLast24Hours = await chatsCol()
      .where('createdAt', '>', Timestamp.fromMillis(now - 24 * 3600 * 1000))
      .where('users', 'array-contains', senderAuthId)
      .get();
    const chatsCreatedByUser = chatsOfLast24Hours.docs
      .map((d) => d.data())
      .filter((d) => d.users[0] === senderAuthId);

    if (chatsCreatedByUser.length < 10) {
      return;
    }

    logger.info(
      `Sending spam alert for ${senderAuthId}, last message: ${chatSnapshot.data().lastMessage}`
    );

    await Promise.all([
      sendSpamAlertEmail(await getChatNotificationParamsForSender()),
      // Update the last alert timestamp
      userPrivateDocRef.update({ latestSpamAlertAt: Timestamp.now() })
    ]);
  }

  if (canCheckForSpamActivity) {
    await checkForSpamActivity();
  }

  async function checkChatBlock() {
    if (chatWindowStartAt && Date.now() - chatWindowStartAt.toMillis() < 24 * 3600 * 1000) {
      // We're in an existing window
      let updateData = {
        chatWindowCount: FieldValue.increment(1)
      };

      if (chatWindowCount > MAX_CHATS_PER_DAY - 2) {
        // Block the user from new chats
        // why -2: e.g. 98 means the *previous* message was 99 or higher, which means the just-sent message was the 100th one or higher.
        // why >: uses > and not === to make sure that a race condition due to many concurrent updates which makes the count past the exact max - 1
        // is also blocked. Maybe transactions are an alternative.
        //
        updateData.chatBlockedAt = Timestamp.now();
        await sendChatBlockedEmail(await getChatNotificationParamsForSender());
      }

      // Apply updates in any case
      await senderMetaRef.set(updateData, { merge: true });
      return;
    }

    // Create a new window in case a current window did not exist
    await senderMetaRef.set(
      { chatWindowStartAt: Timestamp.now(), chatWindowCount: 1 },
      { merge: true }
    );
  }

  await checkChatBlock();
};

/**
 * Creates a new chat between the calling user and `recipientUid`, with `message` as
 * its first message. This is the only way chats are created: clients can not write
 * to `chats` directly (see `firestore.rules`).
 *
 * Two invariants motivate doing this here instead of in Firestore rules:
 *
 * 1. At most one chat may exist between any two users. Rules can only look up known
 *    document paths with `get()`/`exists()`, never query a collection, so they can
 *    not see whether a chat between the pair already exists. Only a compliant
 *    frontend used to prevent duplicates. Without front-end enforcement, future bugs
 *    in the client (or a maliciously modified client) could still create more than one chat.
 * 2. A chat and its first message belong together. They are written in one
 *    transaction, so a failed call can never leave an empty chat behind, and a
 *    retried one (e.g. after a network error) fails with `already-exists` instead of
 *    creating a second chat.
 *
 * The existence check runs inside the transaction: two concurrent calls contend on
 * the same query, so the loser is retried and then sees the chat the winner created.
 *
 * The preconditions below are the ones that used to live in `canCreateChat()` in
 * `firestore.rules`, which was dropped along with client-side chat creation.
 *
 * @param {FV2.CallableRequest<import('../../src/lib/api/functions').CreateChatRequest>} request
 * @returns {Promise<import('../../src/lib/api/functions').CreateChatResponse>}
 */
exports.createChat = async ({ auth: authContext, data }) => {
  if (!authContext) {
    fail('unauthenticated');
  }

  const { uid: senderId, token } = authContext;

  if (!token?.email_verified) {
    logger.warn('An unverified user tried to create a chat. The frontend should prevent this.', {
      senderId
    });
    fail('permission-denied');
  }

  // Validate the payload
  const { recipientUid: recipientId, message: rawMessage } = data ?? {};

  if (typeof recipientId !== 'string' || recipientId.length === 0) {
    logger.warn('Missing or invalid recipient UID while creating a chat', { senderId });
    fail('invalid-argument');
  }

  if (typeof rawMessage !== 'string') {
    logger.warn('Missing or invalid first message while creating a chat', { senderId });
    fail('invalid-argument');
  }

  const message = rawMessage.trim();
  if (message.length < 1 || message.length > exports.MAX_MESSAGE_LENGTH) {
    logger.warn('Invalid first message length while creating a chat', {
      senderId,
      length: message.length
    });
    fail('invalid-argument');
  }

  // A user can not start a chat with themselves
  if (recipientId === senderId) {
    logger.warn('A user tried to start a chat with themselves', { senderId });
    fail('invalid-argument');
  }

  // Check the preconditions on both participants
  const [senderPublicSnap, recipientPublicSnap, senderMetaSnap] = await Promise.all([
    usersDoc(senderId).get(),
    usersDoc(recipientId).get(),
    usersMetaDoc(senderId).get()
  ]);

  const senderPublicData = senderPublicSnap.data();
  if (!senderPublicData) {
    // Shouldn't happen: every authenticated user has a public user doc.
    logger.error("The chat creator's public user document does not exist", { senderId });
    fail('internal');
  }

  // Only members can start new chats
  if (!senderPublicData.superfan) {
    logger.warn('A non-member tried to create a chat. The frontend should prevent this.', {
      senderId
    });
    fail('permission-denied');
  }

  // The recipient's public document should exist
  // Note: this is not a Firebase Auth check, implying that you can still send a new message in
  // a chat with a deleted user.
  if (!recipientPublicSnap.exists) {
    logger.warn('A chat was requested with a non-existing recipient', { senderId, recipientId });
    fail('not-found');
  }

  // The sender was blocked from starting new chats (see `onChatCreate`)
  if (senderMetaSnap.data()?.chatBlockedAt) {
    logger.warn(
      'A user blocked from new chats tried to create one. The frontend should prevent this.',
      { senderId }
    );
    fail('permission-denied');
  }

  const chatRef = chatsCol().doc();
  // All chats the sender participates in. Firestore can't filter on two array members
  // at once, so the recipient is matched in-process.
  const sendersChatsQuery = chatsCol().where('users', 'array-contains', senderId);

  await db.runTransaction(async (transaction) => {
    const sendersChats = await transaction.get(sendersChatsQuery);
    const existingChat = sendersChats.docs.find((chatDoc) =>
      chatDoc.data().users.includes(recipientId)
    );

    if (existingChat) {
      // The chat ID is included so that a client which lost the response of an earlier,
      // successful call can still route to the chat that call created.
      throw new HttpsError('already-exists', 'A chat between these users already exists', {
        chatId: existingChat.id
      });
    }

    const now = Timestamp.now();

    transaction.create(chatRef, {
      // note: by convention, the sender MUST be the first uid in this array
      users: [senderId, recipientId],
      createdAt: now,
      lastActivity: now,
      lastMessage: message,
      lastMessageSeen: false,
      lastMessageSender: senderId
    });

    transaction.create(messagesDoc(chatRef.id), {
      content: message,
      createdAt: now,
      from: senderId
    });
  });

  return { chatId: chatRef.id };
};

/**
 * Server-side API for sending a new message. Emulates the client-side API, but can
 * for now only be used to respond to existing chats. Assumes the message length is already checked.
 *
 * Note: the fromEmail should be verified, message can't be undefined.
 * @param {{chatId: string, message: string, fromEmail: string}} params
 */
exports.sendMessageFromEmail = async function sendMessageFromEmail(params) {
  const { chatId, message, fromEmail: fromEmailRaw } = params;

  const fromEmail = fromEmailRaw.toLowerCase();

  const getUserId = async () => {
    const noValidUserFound = new Error('no-valid-user-found');
    try {
      return (await auth.getUserByEmail(fromEmail)).uid;
    } catch (e) {
      if (shouldReplicateRuntime() && fromEmail.match(/@(?:gmail|googlemail)\.com$/)) {
        /** @type {{error: import('@supabase/supabase-js').PostgrestError, data: Supabase.GetGmailNormalizedEmailResponse}} */
        const {
          error,
          data: { id, email, email_verified }
        } = await supabase().rpc('get_gmail_normalized_email', fromEmail);
        if (error || id == null) {
          logger.warn(
            `Email error: couldn't find the user for email address ${fromEmail} in Firebase Auth or Supabase equivalents.`
          );
          throw noValidUserFound;
        }
        // A match was found
        if (!email_verified) {
          // Note: maybe we should filter only for verified emails in the query.
          // Stll, we shouldn't end up here, because hosts shouldn't be able to add a garden without verification,
          // and travellers can't send an initial message without verification.
          logger.warn(
            `Email error: found equivalent email match (input: ${fromEmail}, canonical: ${email}) but the email wasn't verified, this shouldn't happen.`
          );
          throw noValidUserFound;
        }
        logger.info(
          `Found Gmail equivalent email via Supabase; input: ${fromEmail}, canonical: ${email}`
        );
        return id;
      }
      // No possibility to find equivalent emails, give up
      logger.warn(
        `Email error: couldn't find the user for email address ${fromEmail} using Firebase Auth`
      );
      throw noValidUserFound;
    }
  };

  // Fetch the user & chat concurrently
  const [fromUserId, chat] = await Promise.all([getUserId(), getChat(chatId)]);

  // Verify that the user is in the chat (to prevent maliciously spoofed/modified email)
  const userIsInChat = chat.users.find((uid) => fromUserId === uid);
  if (!userIsInChat) {
    throw new Error(
      `Email error: The user ${fromUserId} matching the 'from' email address ${fromEmail} is not part of the chat ${chatId}`
    );
  }

  // Send message
  await messagesDoc(chatId).create({
    content: message,
    createdAt: Timestamp.now(),
    from: fromUserId
  });

  await chatsDoc(chatId).update({
    lastActivity: Timestamp.now(),
    lastMessage: message,
    lastMessageSeen: false,
    lastMessageSender: fromUserId
  });
};
