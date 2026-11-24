<script setup lang="ts">
// «Ключ для shef.cowork» (docs/MCP.md) — only for the portal admin, only inside the portal frame. Issue shows the
// key once; a new key replaces the previous one; «Отозвать» erases it. Not an admin, or the server has no
// shef.cowork settings — the card is not rendered at all.
import { useMcpAdmin, type McpKeyState } from '~/composables/useMcpAdmin'
import { writeToClipboard } from '~/utils/copyFeedback'

const { login, key } = useMcpAdmin()
const visible = ref(false)
const state = ref<McpKeyState | null>(null)
const shown = ref('')
const busy = ref(false)
const fail = ref('')
const confirmOff = ref(false)
const copied = ref(false)

async function run(action: 'status' | 'issue' | 'revoke') {
  busy.value = true
  fail.value = ''
  try {
    const r = await key(action)
    state.value = r
    shown.value = r.key ?? ''
    copied.value = false
  } catch (e) {
    fail.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
    confirmOff.value = false
  }
}

async function copyKey() {
  copied.value = await writeToClipboard(shown.value)
}

onMounted(async () => {
  const r = await login()
  if (r.state === 'off' || (r.state === 'ready' && !r.admin)) return
  visible.value = true
  if (r.state === 'error') {
    fail.value = r.message
    return
  }
  await run('status')
})
</script>

<template>
  <B24Card
    v-if="visible"
    data-testid="mcp-key-card"
  >
    <template #header>
      <h2 class="text-base font-semibold">
        Ключ для shef.cowork
      </h2>
    </template>
    <div class="flex flex-col gap-3 text-sm">
      <p>
        AI-агент shef.cowork отвечает по курсам НБ РБ и пишет сумму прописью с помощью этого приложения.
        Подключение — в shef.cowork → «Настройки» → «Облачные приложения» → «Добавить приложение»: название
        (например, <code>currency</code>), адрес и ключ отсюда.
      </p>
      <p class="text-(--ui-color-base-3)">
        Все инструменты приложения только читают курсы. Включите там «Доверять пометкам приложения» — тогда
        агент не будет спрашивать подтверждение у сотрудника на каждый курс.
      </p>
      <B24Alert
        v-if="fail"
        color="air-primary-alert"
        :description="fail"
        role="alert"
      />
      <template v-if="state">
        <p>
          Адрес приложения: <code data-testid="mcp-url">{{ state.url }}</code>
        </p>
        <template v-if="shown">
          <B24Alert
            color="air-primary-warning"
            description="Ключ показывается один раз: скопируйте его сейчас."
          />
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <code
              class="break-all min-w-0"
              data-testid="mcp-key"
            >{{ shown }}</code>
            <B24Button
              :label="copied ? 'Скопировано' : 'Копировать'"
              color="air-secondary"
              size="sm"
              @click="copyKey"
            />
          </div>
        </template>
        <p v-else-if="state.exists">
          Ключ создан. Новый ключ заменяет прежний: shef.cowork нужно будет ввести его заново.
        </p>
        <p v-else>
          Ключа нет.
        </p>
        <div
          v-if="!confirmOff"
          class="flex flex-wrap gap-2"
        >
          <B24Button
            :label="state.exists ? 'Создать новый ключ' : 'Создать ключ'"
            color="air-primary"
            :loading="busy"
            @click="run('issue')"
          />
          <B24Button
            v-if="state.exists"
            label="Отозвать"
            color="air-secondary-accent"
            :disabled="busy"
            @click="confirmOff = true"
          />
        </div>
        <template v-else>
          <p>Отозвать ключ? shef.cowork перестанет получать курсы из этого приложения на этом портале.</p>
          <div class="flex gap-2">
            <B24Button
              label="Да, отозвать"
              color="air-primary-alert"
              :loading="busy"
              @click="run('revoke')"
            />
            <B24Button
              label="Отмена"
              color="air-tertiary-no-accent"
              :disabled="busy"
              @click="confirmOff = false"
            />
          </div>
        </template>
      </template>
    </div>
  </B24Card>
</template>
