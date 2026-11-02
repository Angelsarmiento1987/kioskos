/** Firebase Android config contains public identifiers, never a service-account key. */
export function extractGoogleWebClient(config, { appId, projectId }) {
  if (config?.project_info?.project_id !== projectId)
    throw new Error(`El archivo debe pertenecer al proyecto Firebase ${projectId}.`);
  const client = config.client?.find((item) => item.client_info?.android_client_info?.package_name === appId);
  if (!client) throw new Error(`No hay una app Android con paquete ${appId} en este archivo.`);
  const id = client.oauth_client?.find((item) => item.client_type === 3)?.client_id;
  if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id || ""))
    throw new Error("Falta el cliente OAuth web (client_type 3). Habilitá Google, registrá SHA-1 y descargá de nuevo google-services.json.");
  return id;
}
