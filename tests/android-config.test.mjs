import test from "node:test";
import assert from "node:assert/strict";
import { extractGoogleWebClient } from "../shared/android-config.mjs";
const expected = { appId: "com.websinvueltas.rekreo", projectId: "rekreo-app-89930" };
const valid = () => ({ project_info: { project_id: expected.projectId }, client: [
  { client_info: { android_client_info: { package_name: "another.app" } }, oauth_client: [{ client_type: 3, client_id: "wrong.apps.googleusercontent.com" }] },
  { client_info: { android_client_info: { package_name: expected.appId } }, oauth_client: [
    { client_type: 1, client_id: "android.apps.googleusercontent.com" },
    { client_type: 3, client_id: "web-123.apps.googleusercontent.com" },
  ] },
] });
test("Android elige el OAuth web de su paquete y conserva el proyecto existente", () => {
  assert.equal(extractGoogleWebClient(valid(), expected), "web-123.apps.googleusercontent.com");
});
test("Android rechaza otro proyecto, otro paquete y un OAuth web ausente", () => {
  const other = valid(); other.project_info.project_id = "other";
  assert.throws(() => extractGoogleWebClient(other, expected), /proyecto Firebase/);
  assert.throws(() => extractGoogleWebClient(valid(), { ...expected, appId: "unknown" }), /paquete/);
  const missing = valid(); missing.client[1].oauth_client = [{ client_type: 1, client_id: "android.apps.googleusercontent.com" }];
  assert.throws(() => extractGoogleWebClient(missing, expected), /OAuth web/);
});
test("No permite inyectar XML desde la configuración OAuth", () => {
  const config = valid(); config.client[1].oauth_client[1].client_id = '</string><string name="evil">';
  assert.throws(() => extractGoogleWebClient(config, expected), /OAuth web/);
});
