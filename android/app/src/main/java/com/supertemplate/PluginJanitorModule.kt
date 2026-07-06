package com.supertemplate

import com.facebook.react.bridge.*
import java.io.File

/**
 * Workaround for the PluginHost bug where every install/update stacks a new
 * app_<timestamp>.npk + _libs/ + oat/ artifact set without ever deleting the
 * previous ones (plugin dirs grow unbounded — 298 MB observed after ~19
 * reinstalls of a 7 MB plugin).
 *
 * The native module runs inside the PluginHost process (same UID), so it may
 * delete files in the plugin's own install dir. On load we keep the newest
 * app_<timestamp> set (the running version) and delete everything older.
 *
 * Reference: the user's own report and workaround —
 * https://www.reddit.com/r/Supernote_dev/comments/1uo2y0g/
 */
class PluginJanitorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "PluginJanitor"

    @ReactMethod
    fun cleanupOldVersions(dirPath: String, promise: Promise) {
        try {
            val dir = File(dirPath)
            val files = dir.listFiles()
            if (files == null) {
                promise.resolve(result(0, "none")); return
            }

            var maxTs = -1L
            for (f in files) {
                val n = f.name
                if (n.startsWith("app_") && n.endsWith(".npk")) {
                    val ts = leadingDigits(n.substring(4))
                    if (ts > maxTs) maxTs = ts
                }
            }
            if (maxTs < 0) {
                promise.resolve(result(0, "none")); return
            }
            val keep = maxTs.toString()

            var freed = 0L
            for (f in files) {
                val n = f.name
                if (n.startsWith("app_") && !n.contains(keep)) {
                    freed += deleteRecursively(f)
                }
            }

            // Old ART compilation artifacts: oat/<arch>/app_<ts>.{odex,vdex,art}
            // (recursive, matching the canonical implementation in
            //  references/storage-and-lifecycle.md / dashboard v0.13.0)
            val oat = File(dir, "oat")
            if (oat.isDirectory) {
                freed += cleanOat(oat, keep)
            }

            promise.resolve(result(freed, keep))
        } catch (e: Exception) {
            promise.reject("cleanup_failed", e.message, e)
        }
    }

    private fun result(freed: Long, kept: String): WritableMap =
        Arguments.createMap().apply {
            putDouble("freed", freed.toDouble())
            putString("kept", kept)
        }

    private fun cleanOat(node: File, keep: String): Long {
        var freed = 0L
        node.listFiles()?.forEach { k ->
            if (k.isDirectory) {
                freed += cleanOat(k, keep)
            } else if (k.name.startsWith("app_") && !k.name.contains(keep)) {
                val size = k.length()
                if (k.delete()) freed += size
            }
        }
        return freed
    }

    private fun leadingDigits(s: String): Long {
        var i = 0
        while (i < s.length && s[i].isDigit()) i++
        if (i == 0) return -1
        return s.substring(0, i).toLongOrNull() ?: -1
    }

    private fun deleteRecursively(f: File): Long {
        var freed = 0L
        if (f.isDirectory) {
            f.listFiles()?.forEach { freed += deleteRecursively(it) }
        }
        val size = if (f.isFile) f.length() else 0L
        if (f.delete()) freed += size
        return freed
    }
}
