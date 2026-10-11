package expo.modules.cliptranscoder

import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.util.UUID

class TranscodeOptions : Record {
  @Field var uri: String = ""
  @Field var startS: Double = 0.0
  @Field var endS: Double = 0.0
  @Field var width: Int = 0
  @Field var height: Int = 0
  @Field var fps: Double = 30.0
  @Field var dropToFps: Boolean = false
  @Field var bitrate: Int = 8_000_000
}

@OptIn(UnstableApi::class)
class ClipTranscoderModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ClipTranscoder")

    Events("onProgress")

    AsyncFunction("probe") { uri: String -> probe(uri) }

    AsyncFunction("transcode") { o: TranscodeOptions, promise: Promise -> transcode(o, promise) }.runOnQueue(Queues.MAIN)
  }

  private fun probe(uri: String): Map<String, Any> {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(context, Uri.parse(uri))
      val w = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val h = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
      val swap = rotation == 90 || rotation == 270
      return mapOf(
        "width" to if (swap) h else w,
        "height" to if (swap) w else h,
        "fps" to frameRate(uri, retriever, durationMs),
        "durationS" to durationMs / 1000.0
      )
    } finally {
      retriever.release()
    }
  }

  private fun frameRate(uri: String, retriever: MediaMetadataRetriever, durationMs: Long): Double {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(context, Uri.parse(uri), null)
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        if (format.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true && format.containsKey(MediaFormat.KEY_FRAME_RATE)) {
          return format.getNumberCompat(MediaFormat.KEY_FRAME_RATE)
        }
      }
    } catch (_: Exception) {
    } finally {
      extractor.release()
    }
    val frames = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toDoubleOrNull() ?: 0.0
    return if (frames > 0 && durationMs > 0) frames / (durationMs / 1000.0) else 30.0
  }

  private fun MediaFormat.getNumberCompat(key: String): Double =
    try {
      getInteger(key).toDouble()
    } catch (_: ClassCastException) {
      getFloat(key).toDouble()
    }

  // Trim + scale + re-encode to H.264 with Media3 Transformer. Transformer keeps each
  // frame's timestamp, so the source frame rate survives; dropToFps thins it to fps.
  private fun transcode(o: TranscodeOptions, promise: Promise) {
    val ctx = context
    val out = File(ctx.cacheDir, "clip-transcoder/${UUID.randomUUID()}.mp4")
    out.parentFile?.mkdirs()

    val item = MediaItem.Builder()
      .setUri(Uri.parse(o.uri))
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs((o.startS * 1000).toLong())
          .setEndPositionMs((o.endS * 1000).toLong())
          .build()
      )
      .build()
    val effects = mutableListOf<Effect>(Presentation.createForWidthAndHeight(o.width, o.height, Presentation.LAYOUT_SCALE_TO_FIT))
    if (o.dropToFps) effects.add(FrameDropEffect.createDefaultFrameDropEffect(o.fps.toFloat()))
    val edited = EditedMediaItem.Builder(item)
      .setRemoveAudio(true)
      .setEffects(Effects(listOf(), effects))
      .build()

    val handler = Handler(Looper.getMainLooper())
    val holder = ProgressHolder()
    lateinit var transformer: Transformer
    val poll = object : Runnable {
      override fun run() {
        if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
          sendEvent("onProgress", mapOf("progress" to holder.progress / 100.0))
        }
        handler.postDelayed(this, 250)
      }
    }

    transformer = Transformer.Builder(ctx)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setEncoderFactory(
        DefaultEncoderFactory.Builder(ctx)
          .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(o.bitrate).build())
          .setEnableFallback(true)
          .build()
      )
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, result: ExportResult) {
          handler.removeCallbacks(poll)
          val durationS = result.durationMs / 1000.0
          val frames = result.videoFrameCount
          promise.resolve(
            mapOf(
              "uri" to Uri.fromFile(out).toString(),
              "size" to out.length(),
              "width" to o.width,
              "height" to o.height,
              "fps" to if (frames > 1 && durationS > 0) frames / durationS else o.fps,
              "frames" to frames,
              "durationS" to durationS
            )
          )
        }

        override fun onError(composition: Composition, result: ExportResult, exception: ExportException) {
          handler.removeCallbacks(poll)
          out.delete()
          promise.reject(CodedException("ERR_TRANSCODE", "Could not prepare the clip: ${exception.message}", exception))
        }
      })
      .build()
    transformer.start(edited, out.absolutePath)
    handler.post(poll)
  }
}
