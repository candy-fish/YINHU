export const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
export const workspaceService = Object.freeze({
  clearCache() {},
  async current() { return { workspace_id: WORKSPACE_ID }; }
});
