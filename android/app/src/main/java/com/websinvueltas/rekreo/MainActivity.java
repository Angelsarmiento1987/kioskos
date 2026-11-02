package com.websinvueltas.rekreo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RekreoNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
