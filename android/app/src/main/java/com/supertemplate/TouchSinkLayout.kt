package com.supertemplate

import android.content.Context
import android.view.InputDevice
import android.view.MotionEvent
import android.widget.LinearLayout

/**
 * Overlay container that consumes all touch events so taps/drags on the
 * bubble never leak through to the note canvas underneath.
 * (Adapted from Laumss/Inkling, MIT License.)
 */
class TouchSinkLayout(context: Context) : LinearLayout(context) {

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        super.dispatchTouchEvent(ev)
        return true
    }

    override fun dispatchGenericMotionEvent(ev: MotionEvent): Boolean {
        if (ev.isFromSource(InputDevice.SOURCE_STYLUS)) return true
        return super.dispatchGenericMotionEvent(ev)
    }
}
