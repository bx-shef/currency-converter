import { convert } from '../../../app/utils/converter'
import { capitalizeFirst, formatAmount, toKopecks } from '../../../app/utils/formatters'
import { rublesAmountInWords } from '../../../app/utils/numberToWords'
import { MAX_AMOUNT } from '../../../app/config/currencies'
import { addDays, daysBetween, FIRST_BYN_DATE, HISTORY_MAX_DAYS, isIsoDate, minskToday, NbrbUnavailable, NotPublished, type NbrbApi, type OfficialRate, type RatesOnDate } from './nbrbApi'
import type { McpCall } from './protocol'

// MCP tools for shef.cowork (currency-converter #200): official НБ РБ rates on a date, rate history,
// conversion and the sum in words. Read-only, no portal data and no portal tokens. Answers are JSON text
// for the model; amounts go through the app's own helpers (toKopecks is the single kopeck-rounding point).
// Manifest rules — bx-shef/shef-cowork-tools docs/cloud-app.md and docs/rules.md: description 20–1000 chars,
// `kind` set, every string has maxLength, no `pattern`, no "who am I / which portal" parameters.

export interface ToolResult { content: { type: 'text', text: string }[], isError?: true, _meta?: { code: string } }

const ok = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data) }] })
export const toolError = (code: string, text: string): ToolResult =>
  ({ isError: true, content: [{ type: 'text', text }], _meta: { code } })

const SOURCE = 'Национальный банк Республики Беларусь (официальный курс)'
const PORTAL_FIRST = 'Курсы, заданные в самом портале, — встроенным инструментом курсов портала (crm_currency); официальный курс НБ РБ на дату — этим инструментом. Курс в интернете не ищи.'
const CODE = { type: 'string', maxLength: 3, description: 'Код валюты ISO 4217 латиницей: USD, EUR, RUB, BYN…' }
const DATE = { type: 'string', maxLength: 10, description: 'Дата ГГГГ-ММ-ДД; нет — сегодня по Минску' }
const MAX_CODES = 20

export const MCP_TOOLS = [
  {
    name: 'rates',
    title: 'Курсы НБ РБ на дату',
    kind: 'read',
    description: `Официальные курсы белорусского рубля (BYN) от НБ РБ на дату: сколько BYN за единицу валюты и за сколько единиц курс опубликован. ${PORTAL_FIRST}`,
    input: {
      type: 'object',
      properties: {
        date: DATE,
        codes: { type: 'array', maxItems: MAX_CODES, items: CODE, description: 'Какие валюты; нет — основные (USD, EUR, RUB, CNY, KZT, PLN)' }
      }
    }
  },
  {
    name: 'history',
    title: 'История курса НБ РБ',
    kind: 'read',
    description: `Официальный курс одной валюты к BYN по дням за период (до ${HISTORY_MAX_DAYS} дней): для вопросов «как менялся курс», «курс за прошлую неделю». ${PORTAL_FIRST}`,
    input: {
      type: 'object',
      properties: { code: CODE, from: { ...DATE, description: 'Начало периода ГГГГ-ММ-ДД' }, to: { ...DATE, description: 'Конец периода ГГГГ-ММ-ДД; нет — сегодня' } },
      required: ['code', 'from']
    }
  },
  {
    name: 'convert',
    title: 'Конвертация по курсу НБ РБ',
    kind: 'read',
    description: `Пересчёт суммы из одной валюты в другую по официальному курсу НБ РБ на дату (через BYN): итог, курс и дата курса. Для вопросов «сколько 5 000 USD в BYN по курсу на вчера». ${PORTAL_FIRST}`,
    input: {
      type: 'object',
      properties: {
        amount: { type: 'number', minimum: 0, maximum: MAX_AMOUNT, description: 'Сумма в исходной валюте' },
        from: { ...CODE, description: 'Из какой валюты (ISO 4217)' },
        to: { ...CODE, description: 'В какую валюту (ISO 4217)' },
        date: DATE
      },
      required: ['amount', 'from', 'to']
    }
  },
  {
    name: 'sum_in_words',
    title: 'Сумма прописью',
    kind: 'read',
    description: 'Сумма прописью на русском для белорусских (BYN) или российских (RUB) рублей, как в платёжном поручении: «Сто двадцать три рубля 45 копеек». Копейки — цифрами.',
    input: {
      type: 'object',
      properties: {
        amount: { type: 'number', minimum: 0, maximum: MAX_AMOUNT, description: 'Сумма, до копеек' },
        currency: { type: 'string', enum: ['BYN', 'RUB'], description: 'Валюта суммы: BYN или RUB' }
      },
      required: ['amount', 'currency']
    }
  }
] as const

export type ToolName = (typeof MCP_TOOLS)[number]['name']
export const isToolName = (v: string): v is ToolName => MCP_TOOLS.some(t => t.name === v)

const DEFAULT_CODES = ['USD', 'EUR', 'RUB', 'CNY', 'KZT', 'PLN']
const BYN: Omit<OfficialRate, 'date'> = { code: 'BYN', name: 'Белорусский рубль', curId: 0, scale: 1, officialRate: 1, bynRate: 1, periodicity: 'daily' }

class ArgError extends Error {}

function code(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^[A-Za-z]{3}$/.test(v.trim())) throw new ArgError(`${field}: нужен трёхбуквенный код валюты, например USD`)
  return v.trim().toUpperCase()
}

function date(v: unknown, field: string, fallback: string, latest: string): string {
  if (v === undefined || v === null || v === '') return fallback
  if (!isIsoDate(v)) throw new ArgError(`${field}: нужна дата в виде ГГГГ-ММ-ДД`)
  if (v > latest) throw new ArgError(`${field}: курс на ${v} ещё не опубликован — НБ РБ публикует курс не дальше чем на завтра`)
  // Earlier rates are in BYR (10 000 BYR = 1 BYN), not BYN — never mix them in (nbrbApi.ts).
  if (v < FIRST_BYN_DATE) throw new ArgError(`${field}: курсы в BYN — с ${ruDate(FIRST_BYN_DATE)} (деноминация 2016 года); раньше курсы в старых рублях (BYR), этим инструментом не выдаются`)
  return v
}

function amount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_AMOUNT) throw new ArgError(`amount: нужно число от 0 до ${MAX_AMOUNT}`)
  return v
}

/**
 * Rate of `c` on that date, BYN included. Missing with a complete feed — ArgError (НБ РБ does not rate it);
 * missing while the monthly feed failed — NbrbUnavailable (it may be a monthly-only currency).
 */
function rateOf(r: RatesOnDate, c: string, onDate: string): OfficialRate {
  if (c === 'BYN') return { ...BYN, date: onDate }
  const found = r.rates.get(c)
  if (found) return found
  if (!r.complete) throw new NbrbUnavailable('monthly feed failed')
  throw new ArgError(`Нет официального курса ${c} на ${onDate}: НБ РБ не устанавливает курс этой валюты. Проверьте код (ISO 4217).`)
}

function ruDate(iso: string) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}
const rateLine = (r: OfficialRate) => `${r.scale} ${r.code} = ${r.officialRate} BYN`

export class McpTools {
  constructor(private readonly nbrb: NbrbApi, private readonly now: () => number = () => Date.now()) {}

  async run(c: Pick<McpCall, 'tool' | 'args'>): Promise<ToolResult> {
    try {
      switch (c.tool) {
        case 'rates': return ok(await this.rates(c.args))
        case 'history': return ok(await this.history(c.args))
        case 'convert': return ok(await this.convert(c.args))
        case 'sum_in_words': return ok(this.sumInWords(c.args))
        default: return toolError('unknown_tool', 'Нет такого инструмента')
      }
    } catch (e) {
      if (e instanceof ArgError) return toolError('bad_args', e.message)
      if (e instanceof NotPublished) return toolError('not_published', `Курс на ${ruDate(e.message)} НБ РБ ещё не установил: курс на завтра публикуется днём. Назовите курс на сегодня или повторите позже.`)
      if (e instanceof NbrbUnavailable) return toolError('rates_unavailable', 'НБ РБ сейчас не отвечает. Временная ошибка — повторите через минуту; курс из интернета не подставляйте.')
      throw e
    }
  }

  private today() { return minskToday(this.now()) }
  private latest() { return addDays(this.today(), 1) }

  private async rates(a: Record<string, unknown>) {
    const on = date(a.date, 'date', this.today(), this.latest())
    const asked = Array.isArray(a.codes) && a.codes.length ? a.codes.slice(0, MAX_CODES).map((v, i) => code(v, `codes[${i}]`)) : DEFAULT_CODES
    const on2 = await this.nbrb.ratesOn(on)
    const rates = [...new Set(asked)].filter(c => c !== 'BYN').map((c) => {
      const r = on2.rates.get(c)
      if (r) return { code: r.code, name: r.name, scale: r.scale, officialRate: r.officialRate, bynPerUnit: r.bynRate, date: r.date, periodicity: r.periodicity }
      return { code: c, missing: on2.complete ? 'НБ РБ не устанавливает курс этой валюты' : 'Курс сейчас не получен (месячный курс НБ РБ не ответил) — повторите позже' }
    })
    return { source: SOURCE, date: on, rates, say: 'Называй курс вместе с датой и масштабом (например, «100 RUB = 3,52 BYN»). Курс с periodicity monthly установлен на месяц.' }
  }

  private async history(a: Record<string, unknown>) {
    const c = code(a.code, 'code')
    if (c === 'BYN') throw new ArgError('code: история курса — для иностранной валюты; BYN — базовая валюта')
    const to = date(a.to, 'to', this.today(), this.latest())
    if (a.from === undefined || a.from === null || a.from === '') throw new ArgError('from: нужно начало периода ГГГГ-ММ-ДД')
    const from = date(a.from, 'from', to, this.latest())
    if (from > to) throw new ArgError('from: начало периода позже конца')
    if (daysBetween(from, to) + 1 > HISTORY_MAX_DAYS) throw new ArgError(`Период не длиннее ${HISTORY_MAX_DAYS} дней — разбейте на части`)
    let res
    try {
      res = await this.nbrb.history(c, from, to)
    } catch (e) {
      if (e instanceof RangeError) throw new ArgError(`Нет официального курса ${c}: НБ РБ не устанавливает курс этой валюты.`)
      throw e
    }
    const pts = res.points
    const first = pts[0]
    const last = pts[pts.length - 1]
    // Per-unit values: the scale may change inside the period (KZT 1 → 1000), published rates are not comparable.
    const per = pts.map(p => p.bynRate)
    const round = (v: number) => Math.round(v * 1e8) / 1e8
    const notes: string[] = []
    if (res.periodicity === 'monthly') notes.push('Курс этой валюты НБ РБ устанавливает раз в месяц — точки только на первые рабочие дни месяцев.')
    if (!pts.length) notes.push('За период НБ РБ курсов не публиковал.')
    else if (first!.date > from) notes.push(`Первый курс за период — на ${ruDate(first!.date)}.`)
    if (new Set(pts.map(p => p.scale)).size > 1) notes.push('Масштаб курса менялся внутри периода — сравнивай bynPerUnit, а не officialRate.')
    return {
      source: SOURCE, code: c, name: res.name, periodicity: res.periodicity, from, to,
      points: pts.map(p => ({ date: p.date, scale: p.scale, officialRate: p.officialRate, bynPerUnit: round(p.bynRate) })),
      ...(first && last ? { changePerUnit: round(last.bynRate - first.bynRate), minPerUnit: round(Math.min(...per)), maxPerUnit: round(Math.max(...per)) } : {}),
      say: [`Курс — BYN за scale единиц ${c}; bynPerUnit — за одну. Не перечисляй все дни без просьбы: начало, конец, изменение, минимум и максимум.`, ...notes].join(' ')
    }
  }

  private async convert(a: Record<string, unknown>) {
    const sum = amount(a.amount)
    const from = code(a.from, 'from')
    const to = code(a.to, 'to')
    const on = date(a.date, 'date', this.today(), this.latest())
    const on2 = from === 'BYN' && to === 'BYN' ? { rates: new Map<string, OfficialRate>(), complete: true } : await this.nbrb.ratesOn(on)
    const rf = rateOf(on2, from, on)
    const rt = rateOf(on2, to, on)
    // Same path as the converter screen (convert → 4-decimal grid → toKopecks): the tool and the page agree to the
    // kopeck. Rounding the exact product directly would differ from the page by one kopeck on ~0.5% of sums.
    const raw = convert(sum, rf.bynRate, rt.bynRate)
    const kopecks = raw === undefined ? NaN : toKopecks(raw)
    if (!Number.isSafeInteger(kopecks)) throw new ArgError('Сумма слишком велика для точного пересчёта до копеек — уменьшите её')
    const result = kopecks / 100
    return {
      source: SOURCE,
      date: on,
      amount: sum,
      from,
      to,
      result,
      resultText: `${formatAmount(result)} ${to}`,
      rates: [rf, rt].filter(r => r.code !== 'BYN').map(r => ({ rate: rateLine(r), date: r.date, periodicity: r.periodicity })),
      say: `Назови итог, курс и дату курса: «${formatAmount(sum)} ${from} = ${formatAmount(result)} ${to} по курсу НБ РБ на ${ruDate(on)}». Кросс-курс считается через BYN.`
    }
  }

  private sumInWords(a: Record<string, unknown>) {
    const sum = amount(a.amount)
    const cur = a.currency === 'BYN' || a.currency === 'RUB' ? a.currency : null
    if (!cur) throw new ArgError('currency: только BYN или RUB')
    return {
      amount: toKopecks(sum) / 100,
      currency: cur,
      words: capitalizeFirst(rublesAmountInWords(sum)),
      say: cur === 'BYN' ? 'Белорусские рубли; при необходимости уточни «белорусских рублей».' : 'Российские рубли.'
    }
  }
}
