import { readFile, writeFile } from "node:fs/promises";
import { extractGoogleWebClient } from "../shared/android-config.mjs";
const root = new URL("../", import.meta.url);
const capacitor = JSON.parse(await readFile(new URL("capacitor.config.json", root), "utf8"));
const source = new URL("android/app/google-services.json", root);
try {
  const config = JSON.parse(await readFile(source, "utf8"));
  const client = extractGoogleWebClient(config, { appId: capacitor.appId, projectId: "rekreo-app-89930" });
  await writeFile(new URL("android/app/src/main/res/values/google-client.xml", root),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="google_web_client_id" translatable="false">${client}</string></resources>\n`);
  console.log("Google Android configurado. Registrá también la firma de Play en Firebase antes de publicar.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  // Reset rather than retain a stale client from a different Firebase project.
  await writeFile(new URL("android/app/src/main/res/values/google-client.xml", root),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="google_web_client_id" translatable="false"></string></resources>\n');
  console.warn("Pendiente: android/app/google-services.json. Email/contraseña y QR siguen disponibles; Google mostrará instrucciones hasta configurarlo.");
  if (process.argv.includes("--required")) process.exitCode = 1;
}
