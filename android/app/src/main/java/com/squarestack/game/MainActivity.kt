package com.squarestack.game

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    companion object {
        private const val FILE_CHOOSER_REQUEST = 4102
        private const val GAME_URL =
            "https://bogdansavitchi01-boop.github.io/square-stack-multiplayer/"
    }

    private lateinit var gameView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    @Suppress("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        gameView = WebView(this)
        gameView.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )

        gameView.settings.javaScriptEnabled = true
        gameView.settings.domStorageEnabled = true
        gameView.settings.databaseEnabled = true
        gameView.settings.allowFileAccess = false
        gameView.settings.allowContentAccess = true
        gameView.settings.javaScriptCanOpenWindowsAutomatically = false
        gameView.settings.setSupportMultipleWindows(false)
        gameView.settings.setSupportZoom(false)
        gameView.settings.builtInZoomControls = false
        gameView.settings.displayZoomControls = false
        gameView.settings.useWideViewPort = true
        gameView.settings.loadWithOverviewMode = true
        gameView.settings.mediaPlaybackRequiresUserGesture = false

        gameView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val host = request.url.host ?: return true
                return host != "bogdansavitchi01-boop.github.io" &&
                    host != "square-stack-multiplayer-1.onrender.com"
            }
        }

        gameView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = callback

                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(
                        Intent.EXTRA_MIME_TYPES,
                        arrayOf("image/png", "application/zip", "application/x-zip-compressed")
                    )
                }

                return try {
                    startActivityForResult(
                        Intent.createChooser(intent, "Alege fișierul"),
                        FILE_CHOOSER_REQUEST
                    )
                    true
                } catch (_: Exception) {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    false
                }
            }
        }

        setContentView(gameView)

        if (savedInstanceState == null) {
            gameView.loadUrl(GAME_URL)
        } else {
            gameView.restoreState(savedInstanceState)
        }
    }

    @Deprecated("Deprecated in Android API, kept for broad device compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST) {
            val result = if (resultCode == RESULT_OK && data?.data != null) {
                arrayOf(data.data!!)
            } else {
                null
            }
            fileChooserCallback?.onReceiveValue(result)
            fileChooserCallback = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        gameView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Deprecated in Android API, kept for compatibility")
    override fun onBackPressed() {
        if (::gameView.isInitialized && gameView.canGoBack()) {
            gameView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        if (::gameView.isInitialized) {
            gameView.stopLoading()
            gameView.destroy()
        }
        super.onDestroy()
    }
}
