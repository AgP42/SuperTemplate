package com.supertemplate

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SuperTemplatePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        val modules = mutableListOf<NativeModule>()
        try {
            modules.add(FloatingBubbleModule(reactContext))
        } catch (e: Exception) {
            android.util.Log.e("SuperTemplatePackage", "FloatingBubble failed: ${e.message}", e)
        }
        try {
            modules.add(PluginJanitorModule(reactContext))
        } catch (e: Exception) {
            android.util.Log.e("SuperTemplatePackage", "PluginJanitor failed: ${e.message}", e)
        }
        return modules
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
