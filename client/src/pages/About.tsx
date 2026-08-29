import PublicPageLayout from "@/components/PublicPageLayout";

export default function About() {
  return (
    <PublicPageLayout
      eyebrow="ABOUT THE INDEX"
      title="關於我們"
      intro="The Escape Index 是一份以台灣密室逃脫為主題的編輯型導覽，協助你在出發前，用更清楚的條件比較適合團隊的選擇。"
    >
      <h2>我們想解決的問題</h2>
      <p>密室逃脫的主題、建議人數、遊戲時間與刺激程度，常分散在不同店家的官方頁面與預約系統裡。我們把公開可查的資訊整理成一個可搜尋、可篩選的主題資料庫，讓你能先從團隊人數、城市與遊戲風格開始，再前往場館官方頁面確認最新細節。</p>

      <h2>我們如何整理資料</h2>
      <p>網站內容由編輯依公開資訊進行整理與分類。主題卡片上的人數、時間、城市、風格標籤與摘要，是用來協助瀏覽的導覽欄位，不代表玩家實測心得、店家承諾或我們對體驗結果的保證。若資料涉及場次、票價、營業時間、可預約日期或主題狀態，請以場館官方公告為準。</p>
      <div className="not-prose my-8 border border-[#c89b5c]/30 bg-[#151917] p-5 text-sm leading-7 text-white/65 sm:p-6">
        <strong className="text-[#c89b5c]">編輯原則</strong>
        <p className="mt-2">我們不以未經證實的玩家評論充當內容，也不虛構評分、推薦或合作關係；當公開資訊不足時，會保留「依官網公告」等提示，讓讀者知道仍需自行確認。</p>
      </div>

      <h2>與場館及預約平台的關係</h2>
      <p>The Escape Index 是獨立的資訊整理網站，除非頁面另有明確說明，並不代表任何密室逃脫場館、品牌或預約平台。主題卡片中的「前往官方預約頁」會將你帶往第三方網站；該網站的價格、付款、取消、個資與服務條款，均由第三方負責。</p>

      <h2>持續修正與回饋</h2>
      <p>資料會隨公開來源與場館公告變動而需要更新。如果你發現主題資料錯誤、連結失效或頁面需要補充，歡迎透過<a href="/contact" className="text-[#c89b5c] underline underline-offset-4">聯絡我們</a>頁面提供線索，我們會依可查證的資訊進行檢視。</p>
    </PublicPageLayout>
  );
}
