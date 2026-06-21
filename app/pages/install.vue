<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { withoutTrailingSlash } from 'ufo'
import { useB24 } from '~/composables/useB24'
import { IM_TEXTAREA_PLACEMENT } from '~/config/b24'
import { contentLocales } from '../../i18n/i18n'
import { sleep } from '~/utils/sleep'

definePageMeta({ layout: 'clear' })

const config = useRuntimeConfig()
const configuredSiteUrl = withoutTrailingSlash((config.public.siteUrl as string) || '')

// In dev the public URL isn't known ahead of time (ngrok rotates, local IPs vary):
// derive it from the install URL by stripping the trailing `/install`. In prod, use
// the configured site URL.
const isDev = import.meta.env.DEV
const appUrl = isDev && typeof window !== 'undefined'
  ? withoutTrailingSlash(`${window.location.origin}${window.location.pathname.replace(/\/install\/?$/, '')}`)
  : configuredSiteUrl

const { t, locale } = useI18n()
const router = useRouter()
const toast = useToast()
const b24Instance = useB24()

const isUseB24 = computed<boolean>(() => b24Instance.isInit())

useHead({ title: t('page.install.seo.title') })

const progressColor = ref<'air-primary' | 'air-primary-success' | 'air-primary-warning' | 'air-primary-alert'>('air-primary')
const progressValue = ref<null | number>(null)
// Non-empty while the last install attempt failed — drives the retry UI.
const installError = ref('')
// True while an install attempt is in flight — guards the Retry button.
const isRunning = ref(false)

const requiredScopes = b24Instance.getRequiredRights()

const PLACEMENT = IM_TEXTAREA_PLACEMENT

interface PlacementBinding {
  handlerPath: string
  width: string
  height: string
}

const placementBinding: PlacementBinding = {
  handlerPath: '/widget/converter',
  // Compact iframe matching the widget UI — currency rows + insert button.
  width: '360',
  height: '320'
}

const handlerUrl = computed(() => `${appUrl}${placementBinding.handlerPath}`)

interface InitData {
  appInfo?: { ID?: number, CODE?: string, VERSION?: string, STATUS?: string }
  profile?: { ID?: number, NAME?: string, LAST_NAME?: string, ADMIN?: boolean }
  scope?: string[]
  placementList?: { placement: string, handler: string }[]
}

const initData = ref<InitData>({})

const diagnostics = computed(() => {
  const granted = initData.value.scope ?? []
  const missing = requiredScopes.filter(s => !granted.includes(s))
  let domain = ''
  if (isUseB24.value) {
    const auth = b24Instance.getOrThrow().auth.getAuthData()
    domain = auth === false ? '' : auth.domain
  }
  return {
    mode: isUseB24.value ? 'B24 frame' : 'Standalone (mock)',
    isMock: !isUseB24.value,
    domain,
    targetOrigin: isUseB24.value ? b24Instance.targetOrigin() : '—',
    handler: handlerUrl.value || '—',
    appInfo: initData.value.appInfo,
    profile: initData.value.profile,
    granted,
    missing,
    placements: initData.value.placementList ?? []
  }
})

interface InstallStep {
  caption: string
  action: () => Promise<void>
}

const steps: Record<string, InstallStep> = {
  init: { caption: t('page.install.step.init.caption'), action: makeInit },
  placement: { caption: t('page.install.step.placement.caption'), action: makePlacement },
  finish: { caption: t('page.install.step.finish.caption'), action: makeFinish }
}
const stepCode = ref<string>('init')

/**
 * Builds the LANG_ALL map for placement.bind: TITLE per locale Bitrix24 ships.
 * Uses the same locale codes as our i18n setup, so vue-i18n's fallback chain
 * applies — missing translations resolve to English.
 */
function buildLangAll() {
  const out: Record<string, { TITLE: string }> = {}
  for (const loc of contentLocales) {
    const title = locale.value === loc.code
      ? t('app.title')
      // Use vue-i18n's tm/te machinery indirectly: ask t() to resolve the key
      // with an explicit locale override. te() doesn't accept locale, so we
      // wrap with try/catch to be safe.
      : t('app.title', {}, { locale: loc.code }) as string
    out[loc.code] = { TITLE: title }
  }
  return out
}

async function makeInit(): Promise<void> {
  if (!isUseB24.value) return
  const $b24 = b24Instance.getOrThrow()

  await $b24.parent.setTitle(t('page.install.seo.title'))

  const response = await $b24.callBatch({
    appInfo: { method: 'app.info' },
    profile: { method: 'profile' },
    placementList: { method: 'placement.get' },
    scope: { method: 'scope' }
  })

  initData.value = response.getData() as InitData

  if (import.meta.dev) {
    const authData = $b24.auth.getAuthData()
    console.info('[install] mode=B24, domain=%s, targetOrigin=%s, handler=%s',
      authData === false ? '?' : authData.domain,
      b24Instance.targetOrigin(),
      handlerUrl.value)
    console.info('[install] scope=', initData.value.scope)
    console.info('[install] existing placements=', initData.value.placementList)
  }
}

async function makePlacement(): Promise<void> {
  if (!isUseB24.value) return
  const $b24 = b24Instance.getOrThrow()

  // In prod, `appUrl` comes from `NUXT_PUBLIC_SITE_URL`. If the deploy didn't
  // pass that build-arg the HANDLER becomes relative, and B24 will store a
  // broken placement that fails to load in the chat. Refuse to bind in that
  // case — better to surface the misconfig than ship a dead button.
  if (!appUrl || !/^https?:\/\//i.test(handlerUrl.value)) {
    const msg = `Refusing placement.bind: handler URL is not absolute (${handlerUrl.value || 'empty'}). Set NUXT_PUBLIC_SITE_URL at build time.`
    console.error('[install]', msg)
    throw new Error(msg)
  }

  const placementList = initData.value.placementList ?? []
  // Remove every existing IM_TEXTAREA binding from this app (any handler) — old
  // bindings may point at a previous deploy domain. Clear all of ours before
  // re-binding so we end up with exactly one clean registration.
  const stale = placementList.filter(item => item.placement === PLACEMENT)

  const calls: { method: string, params: Record<string, unknown> }[] = []
  for (const s of stale) {
    calls.push({ method: 'placement.unbind', params: { PLACEMENT, HANDLER: s.handler } })
  }

  const TITLE = t('app.title')
  calls.push({
    method: 'placement.bind',
    params: {
      PLACEMENT,
      HANDLER: handlerUrl.value,
      TITLE,
      LANG_ALL: buildLangAll(),
      OPTIONS: {
        // `iconName` is the chip LABEL in the chat panel. B24 constraints:
        // ≤50 chars, Latin letters / space / hyphen only. Keep it ASCII so
        // every portal language renders the same string.
        iconName: 'Currency',
        // ALL = USER + CHAT + LINES + CRM (per B24 docs: when ALL is passed
        // together with other contexts, only ALL takes effect).
        context: 'ALL',
        role: 'USER',
        color: 'AZURE',
        width: placementBinding.width,
        height: placementBinding.height,
        extranet: 'N'
      }
    }
  })

  const result = await $b24.callBatch(calls, false)
  if (import.meta.dev) console.info('[install] placement.bind result:', result.getData())

  // Refresh placement list so the diagnostic panel reflects the new state.
  const after = await $b24.callMethod('placement.get', {})
  initData.value.placementList = after.getData() as InitData['placementList']
}

async function makeFinish(): Promise<void> {
  if (!isUseB24.value) return
  const $b24 = b24Instance.getOrThrow()

  progressColor.value = 'air-primary-success'
  progressValue.value = 100

  await sleep(2000)
  await $b24.installFinish()
}

async function waitForB24(timeoutMs = 10000): Promise<boolean> {
  await b24Instance.init()
  const start = Date.now()
  while (!isUseB24.value && (Date.now() - start) < timeoutMs) {
    await sleep(100)
  }
  return isUseB24.value
}

/** Runs the full install flow. Surfaces failures as a retryable error state
 *  instead of throwing (a thrown error left the page stuck with no way out). */
async function runInstall() {
  if (isRunning.value) return // guard against double-clicking Retry
  isRunning.value = true
  installError.value = ''
  progressColor.value = 'air-primary'
  progressValue.value = null
  stepCode.value = 'init'
  try {
    const ready = await waitForB24()

    if (!ready) {
      toast.add({
        id: 'install-warning-mock',
        title: t('mock.title'),
        description: t('mock.description'),
        color: 'air-primary-warning',
        duration: 0,
        close: false
      })

      for (const key of Object.keys(steps)) {
        stepCode.value = key
        await sleep(600)
      }

      progressColor.value = 'air-primary-warning'
      progressValue.value = 99

      await sleep(2000)
      toast.remove('install-warning-mock')
      await router.replace('/')
      return
    }

    // makeInit() (the first step below) sets the iframe title — no need to repeat it here.
    for (const [key, step] of Object.entries(steps)) {
      stepCode.value = key
      await step.action()
    }
  } catch (error: unknown) {
    console.error('[install]', error)
    progressColor.value = 'air-primary-alert'
    installError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isRunning.value = false
  }
}

onMounted(runInstall)
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-4 gap-4">
    <div class="flex flex-col items-center gap-4 w-full max-w-2xl">
      <h1 class="text-2xl font-bold text-(--ui-color-base-1) text-center">
        {{ t('page.install.ui.title') }}
      </h1>

      <B24Progress
        v-model="progressValue"
        size="xs"
        animation="elastic"
        :color="progressColor"
        class="w-1/2"
      />

      <!-- Error state with retry — replaces the previous hard crash. -->
      <div
        v-if="installError"
        class="flex flex-col items-center gap-2 text-center"
      >
        <p class="text-sm font-medium text-(--ui-color-accent-main-alert)">
          {{ t('page.install.error.title') }}
        </p>
        <p class="text-xs text-(--ui-color-base-3) break-all max-w-md">
          {{ installError }}
        </p>
        <B24Button
          :label="t('page.install.error.retry')"
          color="air-primary"
          size="sm"
          :disabled="isRunning"
          @click="runInstall"
        />
      </div>
      <p
        v-else
        class="text-sm text-(--ui-color-base-3)"
      >
        {{ steps[stepCode]?.caption || '...' }}
      </p>

      <B24Accordion
        :items="[{ label: t('page.install.diagnostics.title'), value: 'diag', slot: 'diag' }]"
        type="multiple"
        class="w-full mt-4"
      >
        <template #diag>
          <div class="flex flex-col gap-3 text-sm font-mono p-2">
            <div class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
              <span class="text-(--ui-color-base-3)">{{ t('page.install.diagnostics.mode') }}:</span>
              <span>{{ diagnostics.mode }}</span>
              <span class="text-(--ui-color-base-3)">{{ t('page.install.diagnostics.domain') }}:</span>
              <span>{{ diagnostics.domain || '—' }}</span>
              <span class="text-(--ui-color-base-3)">{{ t('page.install.diagnostics.targetOrigin') }}:</span>
              <span class="break-all">{{ diagnostics.targetOrigin }}</span>
              <span class="text-(--ui-color-base-3)">{{ t('page.install.diagnostics.handler') }}:</span>
              <span class="break-all">{{ diagnostics.handler }}</span>
              <template v-if="diagnostics.appInfo">
                <span class="text-(--ui-color-base-3)">{{ t('page.install.diagnostics.appCode') }}:</span>
                <span>{{ diagnostics.appInfo.CODE }} (id {{ diagnostics.appInfo.ID }}, v{{ diagnostics.appInfo.VERSION }})</span>
              </template>
            </div>

            <div
              v-if="diagnostics.granted.length || diagnostics.missing.length"
              class="flex flex-col gap-1"
            >
              <span class="text-(--ui-color-base-3)">{{ t('page.install.diagnostics.scopes') }}:</span>
              <div class="flex flex-wrap gap-1">
                <B24Badge
                  v-for="s in diagnostics.granted"
                  :key="`g-${s}`"
                  :label="s"
                  color="air-primary-success"
                  variant="soft"
                  size="sm"
                />
                <B24Badge
                  v-for="s in diagnostics.missing"
                  :key="`m-${s}`"
                  :label="`${s} (missing)`"
                  color="air-primary-alert"
                  variant="soft"
                  size="sm"
                />
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <span class="text-(--ui-color-base-3)">{{ t('page.install.diagnostics.placements') }}:</span>
              <div
                v-if="diagnostics.placements.length === 0"
                class="text-(--ui-color-base-3) italic"
              >
                {{ t('page.install.diagnostics.noPlacements') }}
              </div>
              <ul
                v-else
                class="list-none m-0 p-0 flex flex-col gap-1"
              >
                <li
                  v-for="(p, i) in diagnostics.placements"
                  :key="i"
                  class="break-all"
                >
                  <strong>{{ p.placement }}</strong> → {{ p.handler }}
                </li>
              </ul>
            </div>
          </div>
        </template>
      </B24Accordion>
    </div>
  </div>
</template>
