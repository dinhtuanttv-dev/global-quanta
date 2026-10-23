import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('VITE_MARKET_GATEWAY_ENABLED', 'true');
vi.stubEnv('VITE_MARKET_API_BASE_URL', 'https://gw.test');
const api = await import('./api');

const tokenRes = (over: Record<string, unknown> = {}) => ({
  access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 900, token_type: 'bearer',
  user: { id: 'u1', email: 'dinh@x.vn', admin: true, mustChangePassword: false }, ...over,
});
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('đăng nhập qua Gateway (Railway)', () => {
  it('đăng nhập thành công lưu phiên mới; lỗi trả thông báo của máy chủ', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(200, tokenRes()));
    vi.stubGlobal('fetch', fetchMock);
    expect(await api.login(' dinh@x.vn ', 'pw')).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('https://gw.test/api/auth/login');
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ email: 'dinh@x.vn', password: 'pw' });
    expect(api.hasAuthSession()).toBe(true);
    expect(api.currentUser()?.admin).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => json(429, { error: 'Tài khoản tạm khoá do nhập sai nhiều lần. Thử lại sau 15 phút.' })));
    expect(await api.login('dinh@x.vn', 'sai')).toMatch(/tạm khoá/);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => { throw new Error('offline'); }));
    expect(await api.login('dinh@x.vn', 'pw')).toMatch(/Không kết nối/);
  });

  it('phiên sắp hết hạn -> tự đổi bằng refresh token; 401 -> xoá phiên; lỗi mạng tạm -> giữ phiên', async () => {
    localStorage.setItem('gq_session_v2', JSON.stringify({ access_token: 'old', refresh_token: 'r0', expires_at: Date.now() + 10_000, user: tokenRes().user }));
    const ok = vi.fn(async (_url: string, _init?: RequestInit) => json(200, tokenRes({ access_token: 'acc-2', refresh_token: 'r1' })));
    vi.stubGlobal('fetch', ok);
    expect(await api.getAccessToken()).toBe('acc-2');
    expect(JSON.parse((ok.mock.calls[0][1] as RequestInit).body as string)).toEqual({ refresh_token: 'r0' });
    localStorage.setItem('gq_session_v2', JSON.stringify({ access_token: 'old', refresh_token: 'r1', expires_at: Date.now() + 10_000, user: tokenRes().user }));
    vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => json(503, {})));
    expect(await api.restoreSession()).toBe(false);
    expect(localStorage.getItem('gq_session_v2')).not.toBeNull();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => json(401, { error: 'thu hồi' })));
    expect(await api.restoreSession()).toBe(false);
    expect(localStorage.getItem('gq_session_v2')).toBeNull();
  });

  it('phiên Supabase cũ bị xoá và báo một lần', () => {
    localStorage.setItem('gq_supabase_session_v1', '{"access_token":"x"}');
    expect(api.consumeLegacySession()).toBe(true);
    expect(localStorage.getItem('gq_supabase_session_v1')).toBeNull();
    expect(api.consumeLegacySession()).toBe(false);
  });

  it('đổi mật khẩu gửi Bearer token; đăng xuất thu hồi refresh token trên máy chủ', async () => {
    localStorage.setItem('gq_session_v2', JSON.stringify({ access_token: 'acc', refresh_token: 'r9', expires_at: Date.now() + 600_000, user: { ...tokenRes().user, mustChangePassword: true } }));
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json(200, { ok: true }));
    vi.stubGlobal('fetch', f);
    expect(await api.changePassword('cu', 'mat-khau-moi-12')).toBeNull();
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer acc' });
    expect(api.currentUser()?.mustChangePassword).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => json(400, { error: 'Mật khẩu hiện tại không đúng.' })));
    expect(await api.changePassword('sai', 'mat-khau-moi-12')).toMatch(/hiện tại/);
    const out = vi.fn(async (_url: string, _init?: RequestInit) => json(200, { ok: true }));
    vi.stubGlobal('fetch', out);
    await api.signOut();
    expect(out.mock.calls[0][0]).toBe('https://gw.test/api/auth/logout');
    expect(api.hasAuthSession()).toBe(false);
  });
});
