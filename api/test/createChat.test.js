// This integration test requires the Auth and Firestore emulators.
const assert = require('node:assert');
const { faker } = require('@faker-js/faker');
const { createNewUser } = require('../seeders/util');
const { clearAuth, clearFirestore } = require('./util/util');
const { createChat, MAX_MESSAGE_LENGTH } = require('../src/chat');
const { db } = require('../src/firebase');

/**
 * Emulates what `indexCallable` passes to the handler.
 * @param {string} uid
 * @param {any} data
 * @param {{emailVerified?: boolean}} [options]
 */
const request = (uid, data, { emailVerified = true } = {}) => ({
  auth: { uid, token: { email_verified: emailVerified } },
  data
});

/**
 * @param {string} code the expected HttpsError code
 */
const failsWith = (code) => (error) => {
  assert.strictEqual(error.code, code, `Expected a "${code}" error, got "${error.code}"`);
  return true;
};

/** @param {string} firstName */
const newUser = (firstName, { superfan = false } = {}) =>
  createNewUser(
    { email: `${firstName.toLowerCase()}@slowby.travel` },
    {
      firstName,
      lastName: faker.person.lastName(),
      countryCode: 'BE',
      communicationLanguage: 'en',
      superfan,
      reference: null
    }
  );

describe('createChat', () => {
  /** @type {UserRecord} */
  let sender;
  /** @type {UserRecord} */
  let recipient;

  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
    // Only members (superfans) can start chats
    sender = await newUser('Alice', { superfan: true });
    recipient = await newUser('Bob');
  });

  after(async () => {
    await clearFirestore();
    await clearAuth();
  });

  it('creates the chat together with its first message', async () => {
    const { chatId } = await createChat(
      request(sender.uid, { recipientUid: recipient.uid, message: '  Hello there  ' })
    );

    const chat = (await db.collection('chats').doc(chatId).get()).data();
    assert.deepStrictEqual(chat.users, [sender.uid, recipient.uid]);
    // Whitespace around the message is trimmed off
    assert.strictEqual(chat.lastMessage, 'Hello there');
    assert.strictEqual(chat.lastMessageSender, sender.uid);
    assert.strictEqual(chat.lastMessageSeen, false);

    const messages = await db.collection(`chats/${chatId}/messages`).get();
    assert.strictEqual(messages.size, 1);
    assert.strictEqual(messages.docs[0].data().content, 'Hello there');
    assert.strictEqual(messages.docs[0].data().from, sender.uid);
  });

  it('refuses a second chat with the same user, and reports the existing one', async () => {
    const { chatId } = await createChat(
      request(sender.uid, { recipientUid: recipient.uid, message: 'Hello there' })
    );

    await assert.rejects(
      createChat(request(sender.uid, { recipientUid: recipient.uid, message: 'Hello again' })),
      (error) => failsWith('already-exists')(error) && error.details?.chatId === chatId
    );

    assert.strictEqual((await db.collection('chats').get()).size, 1);
  });

  it('refuses a chat back from the recipient of an existing chat', async () => {
    // Make the recipient a member too, so only the existing chat can stop them
    await db.collection('users').doc(recipient.uid).update({ superfan: true });

    await createChat(request(sender.uid, { recipientUid: recipient.uid, message: 'Hello there' }));

    await assert.rejects(
      createChat(request(recipient.uid, { recipientUid: sender.uid, message: 'Hi back' })),
      failsWith('already-exists')
    );
  });

  it('refuses concurrent creations of the same chat', async () => {
    const attempts = await Promise.allSettled(
      new Array(3)
        .fill(1)
        .map(() =>
          createChat(request(sender.uid, { recipientUid: recipient.uid, message: 'Hello there' }))
        )
    );

    assert.strictEqual(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
    attempts
      .filter(({ status }) => status === 'rejected')
      .forEach(({ reason }) => failsWith('already-exists')(reason));

    assert.strictEqual((await db.collection('chats').get()).size, 1);
  });

  it('refuses an unauthenticated caller', async () => {
    await assert.rejects(
      createChat({ data: { recipientUid: recipient.uid, message: 'Hello there' } }),
      failsWith('unauthenticated')
    );
  });

  it('refuses a caller with an unverified email', async () => {
    await assert.rejects(
      createChat(
        request(
          sender.uid,
          { recipientUid: recipient.uid, message: 'Hello there' },
          { emailVerified: false }
        )
      ),
      failsWith('permission-denied')
    );
  });

  it('refuses a non-member sender', async () => {
    const nonMember = await newUser('Charlie');

    await assert.rejects(
      createChat(request(nonMember.uid, { recipientUid: recipient.uid, message: 'Hello there' })),
      failsWith('permission-denied')
    );
  });

  it('refuses a sender that is blocked from starting new chats', async () => {
    await db.collection('users-meta').doc(sender.uid).set({ chatBlockedAt: new Date() });

    await assert.rejects(
      createChat(request(sender.uid, { recipientUid: recipient.uid, message: 'Hello there' })),
      failsWith('permission-denied')
    );
  });

  it('refuses a recipient that does not exist', async () => {
    await assert.rejects(
      createChat(request(sender.uid, { recipientUid: 'does-not-exist', message: 'Hello there' })),
      failsWith('not-found')
    );
  });

  it('refuses a chat with yourself', async () => {
    await assert.rejects(
      createChat(request(sender.uid, { recipientUid: sender.uid, message: 'Hello there' })),
      failsWith('invalid-argument')
    );
  });

  it('refuses an invalid first message', async () => {
    const invalidMessages = ['', '   ', 'x'.repeat(MAX_MESSAGE_LENGTH + 1), undefined, 42];

    await Promise.all(
      invalidMessages.map((message) =>
        assert.rejects(
          createChat(request(sender.uid, { recipientUid: recipient.uid, message })),
          failsWith('invalid-argument'),
          `Expected the message ${JSON.stringify(message)} to be refused`
        )
      )
    );

    assert.strictEqual((await db.collection('chats').get()).size, 0);
  });
});
