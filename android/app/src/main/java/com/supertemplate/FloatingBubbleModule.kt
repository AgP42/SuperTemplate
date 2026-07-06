package com.supertemplate

import android.content.Context
import android.graphics.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.*
import android.widget.LinearLayout
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Persistent floating bubble (TYPE_PHONE overlay) that survives
 * closePluginView(). Tap → "onBubbleTap" JS event; drag to reposition.
 * Adapted from Laumss/Inkling (MIT License) — bubble face redrawn with the
 * SuperTemplate "S" logo.
 */
class FloatingBubbleModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FloatingBubble"

    private val TAG = "STBubble"
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        @Volatile @JvmStatic private var windowManager: WindowManager? = null
        @Volatile @JvmStatic private var bubbleView: LinearLayout? = null
        @Volatile @JvmStatic private var layoutParams: WindowManager.LayoutParams? = null

        @Volatile @JvmStatic private var startX = 0
        @Volatile @JvmStatic private var startY = 0
        @Volatile @JvmStatic private var startRawX = 0f
        @Volatile @JvmStatic private var startRawY = 0f
        @Volatile @JvmStatic private var isDragging = false

        @Volatile @JvmStatic private var screenHeight = 1872
        @Volatile @JvmStatic private var screenWidth = 1404

        @Volatile @JvmStatic private var stickyX: Int = 24
        @Volatile @JvmStatic private var stickyY: Int = 80
    }

    @ReactMethod fun show() {
        handler.post {
            try {
                if (bubbleView != null) return@post
                createBubble()
            } catch (e: Exception) { Log.e(TAG, "show: ${e.message}", e) }
        }
    }

    @ReactMethod fun hide() {
        handler.post {
            try { removeBubble() } catch (e: Exception) { Log.e(TAG, "hide: ${e.message}", e) }
        }
    }

    @ReactMethod fun isShowing(promise: Promise) { promise.resolve(bubbleView != null) }

    @ReactMethod fun checkOverlayPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= 23) promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
        else promise.resolve(true)
    }

    @ReactMethod fun requestOverlayPermission() {
        try {
            reactApplicationContext.startActivity(
                android.content.Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:${reactApplicationContext.packageName}"))
                    .apply { addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK) })
        } catch (e: Exception) {
            Log.e(TAG, "requestOverlayPermission: ${e.message}", e)
            try {
                reactApplicationContext.startActivity(
                    android.content.Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        android.net.Uri.parse("package:${reactApplicationContext.packageName}"))
                        .apply { addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK) })
            } catch (_: Exception) {}
        }
    }

    private fun createBubble() {
        val context = reactApplicationContext
        removeBubble()
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(context)) {
            emitEvent("onBubblePermissionDenied", Arguments.createMap()); return
        }
        windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val dm = context.resources.displayMetrics
        screenHeight = dm.heightPixels
        screenWidth = dm.widthPixels
        val d = dm.density
        val bubbleSize = (40 * d).toInt()

        val iconView = STemplateBubbleView(context, d)
        iconView.layoutParams = LinearLayout.LayoutParams(bubbleSize, bubbleSize)

        bubbleView = TouchSinkLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(iconView)
        }

        @Suppress("DEPRECATION")
        val wmType = WindowManager.LayoutParams.TYPE_PHONE
        layoutParams = WindowManager.LayoutParams(
            bubbleSize, bubbleSize,
            wmType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = stickyX.coerceIn(0, (screenWidth - bubbleSize).coerceAtLeast(0))
            y = stickyY.coerceIn(0, (screenHeight - bubbleSize).coerceAtLeast(0))
        }

        bubbleView!!.setOnTouchListener { _, ev ->
            val lp = layoutParams ?: return@setOnTouchListener false
            val view = bubbleView ?: return@setOnTouchListener false
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = lp.x; startY = lp.y; startRawX = ev.rawX; startRawY = ev.rawY
                    isDragging = false; true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.rawX - startRawX; val dy = ev.rawY - startRawY
                    if (!isDragging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) { isDragging = true }
                    if (isDragging) {
                        lp.x = startX + dx.toInt(); lp.y = startY + dy.toInt()
                        try { windowManager?.updateViewLayout(view, lp) } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_CANCEL -> true
                MotionEvent.ACTION_UP -> {
                    if (isDragging) {
                        stickyX = lp.x; stickyY = lp.y
                    } else {
                        emitEvent("onBubbleTap", Arguments.createMap())
                    }
                    true
                }
                else -> false
            }
        }

        windowManager?.addView(bubbleView, layoutParams)
        Log.i(TAG, "bubble shown")
    }

    private fun removeBubble() {
        if (bubbleView != null) {
            try { windowManager?.removeView(bubbleView) } catch (e: Exception) { Log.w(TAG, "removeView: ${e.message}") }
            bubbleView = null; layoutParams = null
        }
    }

    private fun emitEvent(name: String, params: WritableMap) {
        try { reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, params) }
        catch (e: Exception) { Log.w(TAG, "emitEvent($name): ${e.message}") }
    }

    override fun onCatalystInstanceDestroy() {
        Log.i(TAG, "onCatalystInstanceDestroy — keeping bubble alive")
        super.onCatalystInstanceDestroy()
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}

/**
 * Bubble face: circular white chip with the SuperTemplate mark — rounded
 * square, left spine, filled header bar and a bold "S" (mirrors icon.png).
 */
private class STemplateBubbleView(ctx: Context, private val density: Float) : View(ctx) {

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE; style = Paint.Style.FILL
    }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#111111"); style = Paint.Style.STROKE
        strokeWidth = 1.5f * density
    }
    private val markStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#111111"); style = Paint.Style.STROKE
    }
    private val markFill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#111111"); style = Paint.Style.FILL
    }
    private val sPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#111111")
        typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val cx = w / 2f
        val cy = h / 2f
        val r = (w / 2f) - (1.5f * density)

        canvas.drawCircle(cx, cy, r, bgPaint)
        canvas.drawCircle(cx, cy, r, borderPaint)

        // SuperTemplate mark, scaled to ~62% of the chip
        val m = r * 1.24f            // mark box size
        val left = cx - m / 2f
        val top = cy - m / 2f
        val right = cx + m / 2f
        val bottom = cy + m / 2f
        val corner = m * 0.16f

        markStroke.strokeWidth = m * 0.09f
        canvas.drawRoundRect(RectF(left, top, right, bottom), corner, corner, markStroke)
        // left spine
        markStroke.strokeWidth = m * 0.045f
        val spineX = left + m * 0.18f
        canvas.drawLine(spineX, top + m * 0.06f, spineX, bottom - m * 0.06f, markStroke)
        // header bar
        canvas.drawRect(spineX + m * 0.07f, top + m * 0.12f, right - m * 0.08f, top + m * 0.24f, markFill)
        // bold S
        sPaint.textSize = m * 0.52f
        val sx = spineX + (right - m * 0.08f - spineX) / 2f
        val sy = bottom - m * 0.16f
        canvas.drawText("S", sx, sy, sPaint)
    }
}
