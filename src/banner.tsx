/** @jsxImportSource @opentui/solid */
/**
 * Banner persistente de Kilo Task Recall.
 *
 * Se renderiza en el slot `app_bottom` (siempre visible, encima del pie).
 * A diferencia del toast (que no se puede descartar con click en Kilo 7.8.27),
 * el banner permanece hasta que el usuario lo quita con:
 *   - tecla ctrl+k
 *   - comando /ktr-clear
 *   - o llega un turno nuevo que lo reemplaza.
 */
import { createSignal, Show, type Accessor } from "solid-js"

export type BannerVariant = "info" | "success" | "warning" | "error"

export interface BannerData {
  variant: BannerVariant
  title: string
  lines: string[]
  /** Etiqueta a la izquierda del prompt (línea 0). */
  promptLabel?: string
}

export interface BannerStore {
  data: Accessor<BannerData | null>
  show: (next: BannerData) => void
  dismiss: () => void
}

export function createBannerStore(): BannerStore {
  const [data, setData] = createSignal<BannerData | null>(null)
  return {
    data: data as Accessor<BannerData | null>,
    show: (next: BannerData) => setData(next),
    dismiss: () => setData(null),
  }
}

const VARIANT_COLORS: Record<BannerVariant, string> = {
  info: "#7aa2f7",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",
}

const VARIANT_PREFIX: Record<BannerVariant, string> = {
  info: "ℹ",
  success: "✔",
  warning: "⚠",
  error: "✖",
}

export function RecallBanner(props: { store: BannerStore }) {
  return (
    <Show when={props.store.data()}>
      {(current) => (
        <box flexDirection="column" flexShrink={0}>
          <text fg={VARIANT_COLORS[current().variant]}>
            {VARIANT_PREFIX[current().variant]} {current().title}
          </text>
          <Show when={current().lines.length > 0}>
            <box flexDirection="row" gap={1}>
              <text dim>{current().promptLabel ?? "Escribiste:"}</text>
              <text>{current().lines[0]}</text>
            </box>
            <box flexDirection="column">
              {current().lines.slice(1).map((line) => (
                <text>{line}</text>
              ))}
            </box>
          </Show>
          <text dim>enter / ctrl+k / /ktr-clear para quitar</text>
        </box>
      )}
    </Show>
  )
}