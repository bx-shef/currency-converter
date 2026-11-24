<script setup lang="ts">
// Rate line and a 30-day mini chart for the currency last edited in the chat widget (case 31, issue #200).
// The history is fetched from НБ РБ only when the chart is opened — opening the widget costs nothing extra.
import { historyRange, parseDynamics, parseRateRef, quoteUnits, sparklinePath, summarize, type RatePoint } from '~/utils/rateHistory'

const props = defineProps<{
  /** ISO code of the currency (not BYN). */
  code: string
  /** BYN per one unit, from the loaded rates. */
  perUnit: number
  /** Larger controls in the Bitrix24 mobile app. */
  large?: boolean
}>()

const { t, locale } = useI18n()
const open = ref(false)
const loading = ref(false)
const failed = ref(false)
const points = ref<RatePoint[]>([])
const cache = new Map<string, RatePoint[]>()

const W = 240
const H = 40
const units = computed(() => quoteUnits(props.perUnit))
const fmt = (v: number) => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 4, minimumFractionDigits: 2 }).format(v)
const rateText = computed(() => `${units.value} ${props.code} = ${fmt(props.perUnit * units.value)} BYN`)
const summary = computed(() => summarize(points.value))
const path = computed(() => sparklinePath(points.value.map(p => p.perUnit), W, H))
const chartLabel = computed(() => {
  const s = summary.value
  return s ? t('page.widget.chart.label', { code: props.code, units: units.value, min: fmt(s.min * units.value), max: fmt(s.max * units.value), change: `${s.changePct > 0 ? '+' : ''}${s.changePct}` }) : ''
})

async function load(code: string) {
  const hit = cache.get(code)
  if (hit) {
    points.value = hit
    return
  }
  loading.value = true
  failed.value = false
  try {
    const ref_ = parseRateRef(await $fetch(`https://api.nbrb.by/exrates/rates/${encodeURIComponent(code)}?parammode=2`))
    if (!ref_) throw new Error('no rate')
    const { from, to } = historyRange(new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10))
    const pts = parseDynamics(await $fetch(`https://api.nbrb.by/exrates/rates/dynamics/${ref_.id}?startdate=${from}&enddate=${to}`), ref_.scale)
    cache.set(code, pts)
    if (code === props.code) points.value = pts
  } catch {
    failed.value = true
    points.value = []
  } finally {
    loading.value = false
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) void load(props.code)
}

watch(() => props.code, (code) => {
  points.value = []
  failed.value = false
  if (open.value) void load(code)
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between gap-2 min-w-0">
      <span
        class="truncate min-w-0 tabular-nums text-(--ui-color-base-2)"
        :class="large ? 'text-sm' : 'text-[11px]'"
        data-testid="rate-line"
      >{{ rateText }}</span>
      <B24Button
        color="air-tertiary-no-accent"
        :size="large ? 'sm' : 'xs'"
        class="shrink-0"
        :label="open ? t('page.widget.chart.hide') : t('page.widget.chart.show')"
        :aria-expanded="open"
        @click="toggle"
      />
    </div>
    <div
      v-if="open"
      role="status"
      class="text-(--ui-color-base-3)"
      :class="large ? 'text-xs' : 'text-[10px]'"
    >
      <span v-if="loading">{{ t('page.widget.chart.loading') }}</span>
      <span v-else-if="failed">{{ t('page.widget.chart.failed') }}</span>
      <template v-else-if="summary && path">
        <svg
          :viewBox="`0 0 ${W} ${H}`"
          class="w-full h-10 text-(--ui-color-accent-main-primary)"
          preserveAspectRatio="none"
          role="img"
          :aria-label="chartLabel"
          data-testid="rate-chart"
        >
          <path
            :d="path"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <span>{{ chartLabel }}</span>
      </template>
      <span v-else>{{ t('page.widget.chart.empty') }}</span>
    </div>
  </div>
</template>
