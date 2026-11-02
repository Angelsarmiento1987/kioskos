package com.websinvueltas.rekreo;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

/** Platform UI only. Firebase JS validates the ID token and Firestore enforces permissions. */
@CapacitorPlugin(name = "RekreoNative")
public class RekreoNativePlugin extends Plugin {
    private boolean signingIn = false;
    private boolean scanning = false;

    @PluginMethod
    public void signInGoogle(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (signingIn) { call.reject("Ya hay un ingreso en curso.", "BUSY"); return; }
            String clientId = getContext().getString(R.string.google_web_client_id);
            if (clientId.isEmpty()) {
                call.reject("Falta configurar Google para Android. Agregá google-services.json y ejecutá npm run android:sync. Podés ingresar con email y contraseña.", "NOT_CONFIGURED");
                return;
            }
            signingIn = true;
            try {
                GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(new GetSignInWithGoogleOption.Builder(clientId).build()).build();
                CredentialManager.create(getContext()).getCredentialAsync(getActivity(), request, null,
                    ContextCompat.getMainExecutor(getContext()),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override public void onResult(GetCredentialResponse response) {
                            signingIn = false;
                            try {
                                Credential credential = response.getCredential();
                                if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                                    call.reject("Google devolvió una credencial inesperada.", "INVALID_CREDENTIAL"); return;
                                }
                                String token = GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
                                JSObject result = new JSObject(); result.put("idToken", token); call.resolve(result);
                            } catch (Exception error) { call.reject("No se pudo leer la credencial de Google.", "INVALID_CREDENTIAL"); }
                        }
                        @Override public void onError(@NonNull GetCredentialException error) {
                            signingIn = false;
                            if (error instanceof GetCredentialCancellationException) call.reject("Ingreso cancelado.", "CANCELLED");
                            else call.reject("No se pudo ingresar con Google. Revisá la conexión y la configuración Android en Firebase (paquete, SHA y cliente OAuth).", "GOOGLE_SIGN_IN_FAILED");
                        }
                    });
            } catch (Exception error) {
                signingIn = false; call.reject("No se pudo abrir Google. Probá ingresar con email y contraseña.", "GOOGLE_SIGN_IN_FAILED");
            }
        });
    }

    @PluginMethod
    public void clearGoogleSession(PluginCall call) {
        CredentialManager.create(getContext()).clearCredentialStateAsync(new ClearCredentialStateRequest(), null,
            ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override public void onResult(Void result) { call.resolve(); }
                @Override public void onError(@NonNull ClearCredentialException error) { call.resolve(); }
            });
    }

    @PluginMethod
    public void scanQr(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (scanning) { call.reject("Ya hay un escaneo en curso.", "BUSY"); return; }
            scanning = true;
            try {
                GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build();
                GmsBarcodeScanning.getClient(getActivity(), options).startScan()
                    .addOnSuccessListener(barcode -> {
                        scanning = false;
                        String value = barcode.getRawValue();
                        if (value == null || value.isEmpty()) { call.reject("El QR está vacío.", "INVALID_QR"); return; }
                        JSObject result = new JSObject(); result.put("value", value); call.resolve(result);
                    })
                    .addOnCanceledListener(() -> { scanning = false; call.reject("Escaneo cancelado.", "CANCELLED"); })
                    .addOnFailureListener(error -> {
                        scanning = false;
                        call.reject("No se pudo abrir el lector. Revisá internet y Google Play Services; también podés ingresar el código manual.", "SCAN_FAILED");
                    });
            } catch (Exception error) {
                scanning = false; call.reject("No se pudo iniciar el lector. Usá el código manual.", "SCAN_FAILED");
            }
        });
    }
}
