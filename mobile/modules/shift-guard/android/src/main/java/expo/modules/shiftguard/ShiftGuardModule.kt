package expo.modules.shiftguard

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val LOCATION_TOGGLE_EVENT = "onLocationToggle"

/** JS-обёртка над ShiftGuard: включить слежение, показать/убрать предупреждение, канал службы. */
class ShiftGuardModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }.applicationContext

  override fun definition() = ModuleDefinition {
    Name("ShiftGuard")
    Events(LOCATION_TOGGLE_EVENT)

    OnCreate {
      ShiftGuard.listener = { enabled -> sendEvent(LOCATION_TOGGLE_EVENT, mapOf("enabled" to enabled)) }
    }
    OnDestroy {
      ShiftGuard.listener = null
    }

    Function("isLocationEnabled") { ShiftGuard.isLocationEnabled(context) }
    Function("startWatching") { title: String, body: String -> ShiftGuard.start(context, title, body) }
    Function("stopWatching") { ShiftGuard.stop(context) }
    Function("showLocationOff") { title: String, body: String -> ShiftGuard.showWarning(context, title, body) }
    Function("hideLocationOff") { ShiftGuard.hideWarning(context) }
    Function("prepareServiceChannel") { taskName: String -> ShiftGuard.prepareServiceChannel(context, taskName) }
  }
}
