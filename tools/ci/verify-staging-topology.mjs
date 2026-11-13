// Fail closed until staging API, worker and frontend release identity can be attested.
console.error(
  'Staging promotion blocked: complete topology deployment and release identity attestation are not implemented.',
);
process.exitCode = 1;
