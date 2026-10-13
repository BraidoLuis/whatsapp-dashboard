export default async function teardown() {
  try {
    await fetch('http://127.0.0.1:3219/__test/shutdown', {
      method: 'POST', headers: { 'X-Test-Preview': 'memory-only' }, signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Playwright handles cleanup if the test server already stopped or failed to start.
  }
}
