export function operationErrorMessage(error) {
  switch (error?.code) {
    case "permission-denied":
      return "Firestore rechazó la operación. Publicá el archivo firestore.rules de esta versión y verificá los permisos de tu cuenta. (permission-denied)";
    case "unavailable":
      return "No se pudo conectar con Firestore. Revisá tu conexión e intentá nuevamente. (unavailable)";
    case "deadline-exceeded":
      return "Firestore tardó demasiado en responder. Actualizá la lista antes de reintentar para comprobar si se guardó. (deadline-exceeded)";
    case "unauthenticated":
      return "La sesión no es válida. Volvé a iniciar sesión para continuar.";
    default:
      return (
        error?.message?.replace(/^Firebase:\s*/, "") ||
        "No se pudo completar la operación."
      );
  }
}
