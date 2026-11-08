// Protocol/credential-isolation fixture only. No actual extraction is simulated as provider evidence.
process.once('message', ({ mimeType }) => {
  if (mimeType === 'hang') return setInterval(() => {}, 1000);
  if (mimeType === 'exit') return process.exit(1);
  if (mimeType === 'invalid') return process.send({ error: 'Synthetic failure' });
  process.send({
    text: process.env.PRIVATE_TEST_CREDENTIAL ? 'inherited credentials' : 'credential-free fixture',
  });
});
