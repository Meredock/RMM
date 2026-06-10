const axios = require('axios');
const { checkEndpoint } = require('../src/checker');

jest.mock('axios');

describe('checkEndpoint', () => {
  it('returns ok=true for a 200 response', async () => {
    axios.get.mockResolvedValue({ status: 200 });
    const result = await checkEndpoint({ url: 'https://example.com', expectedStatus: 200 });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.error).toBeNull();
  });

  it('returns ok=false when status does not match expectedStatus', async () => {
    axios.get.mockResolvedValue({ status: 404 });
    const result = await checkEndpoint({ url: 'https://example.com', expectedStatus: 200 });
    expect(result.ok).toBe(false);
  });

  it('returns ok=false on network error', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await checkEndpoint({ url: 'https://unreachable.local' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
    expect(result.status).toBeNull();
  });
});
