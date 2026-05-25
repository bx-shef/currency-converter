<template>
  <div style="display:flex;width:1200px;height:630px;background:linear-gradient(135deg,#3a65ff 0%,#1a3fc4 100%);align-items:center;justify-content:center;font-family:sans-serif;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:40px;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:16px;">
        <div style="display:flex;font-size:84px;font-weight:700;color:white;letter-spacing:-1px;">
          Конвертер валют
        </div>
        <div style="display:flex;font-size:42px;font-weight:400;color:rgba(255,255,255,0.75);">
          Национальный Банк Республики Беларусь
        </div>
      </div>
      <div style="display:flex;gap:18px;">
        <div v-for="code in ['USD', 'EUR', 'BYN', 'RUB', 'CNY', 'TRY']" :key="code"
          style="display:flex;padding:14px 30px;background:rgba(255,255,255,0.18);border-radius:12px;font-size:36px;font-weight:700;color:white;letter-spacing:1px;">
          {{ code }}
        </div>
      </div>
    </div>
  </div>
</template>
