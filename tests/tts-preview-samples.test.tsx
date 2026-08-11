import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TTS_LANGUAGES } from '../src/main/tts/catalog'
import TtsVoiceoverView from '../src/renderer/src/components/TtsVoiceover/TtsVoiceoverView'

const expectedPreviewSamples: Record<string, string> = {
  'zh-CN':
    '智剪是一款简单好用、功能丰富的智能创作工具，可以满足小说推文、短剧制作等多种创作需求，让内容生产更轻松、更高效。',
  'en-US':
    'Smart Edit is an easy-to-use, feature-rich creative tool for novel promotion, short drama production, and more, making content creation simpler and more efficient.',
  'en-GB':
    'Smart Edit is an easy-to-use, feature-rich creative tool for novel promotion, short drama production, and more, making content creation simpler and more efficient.',
  'es-ES':
    'Smart Edit es una herramienta creativa fácil de usar y repleta de funciones, ideal para promocionar novelas, producir dramas cortos y mucho más, haciendo que la creación de contenido sea más sencilla y eficiente.',
  'pt-BR':
    'O Smart Edit é uma ferramenta criativa fácil de usar e repleta de recursos, ideal para promover romances, produzir minidramas e muito mais, tornando a criação de conteúdo mais simples e eficiente.',
  'id-ID':
    'Smart Edit adalah alat kreasi yang mudah digunakan dan kaya fitur, cocok untuk promosi novel, produksi drama pendek, dan berbagai kebutuhan lainnya, sehingga pembuatan konten menjadi lebih mudah dan efisien.',
  'fr-FR':
    "Smart Edit est un outil de création simple à utiliser et riche en fonctionnalités, adapté à la promotion de romans, à la production de mini-séries et à bien d'autres besoins, pour créer du contenu plus facilement et plus efficacement.",
  'de-DE':
    'Smart Edit ist ein benutzerfreundliches und vielseitiges Kreativwerkzeug für Romanwerbung, Kurzdramen und viele weitere Inhalte und macht die Produktion einfacher und effizienter.',
  'ja-JP':
    '智剪は、使いやすく機能豊富なクリエイティブツールです。小説のプロモーションやショートドラマ制作など、さまざまな創作ニーズに対応し、コンテンツ制作をより簡単で効率的にします。',
  'ko-KR':
    '스마트 에디트는 사용하기 쉽고 기능이 풍부한 창작 도구입니다. 소설 홍보와 숏드라마 제작 등 다양한 콘텐츠 작업을 더 쉽고 효율적으로 완성할 수 있습니다.',
  'vi-VN':
    'Smart Edit là công cụ sáng tạo dễ sử dụng và giàu tính năng, đáp ứng nhu cầu quảng bá tiểu thuyết, sản xuất phim ngắn và nhiều nội dung khác, giúp quá trình sáng tạo đơn giản và hiệu quả hơn.',
  'ru-RU':
    'Smart Edit — это простой и многофункциональный инструмент для продвижения романов, создания коротких сериалов и других задач, который делает производство контента легче и эффективнее.',
  'ar-SA':
    'سمارت إيديت أداة إبداعية سهلة الاستخدام وغنية بالميزات، تناسب الترويج للروايات وإنتاج المسلسلات القصيرة وغيرها من الاحتياجات، لتجعل صناعة المحتوى أسهل وأكثر كفاءة.',
  'hi-IN':
    'स्मार्ट एडिट एक आसान और सुविधाओं से भरपूर रचनात्मक टूल है, जो उपन्यास प्रचार, लघु नाटक निर्माण और अन्य जरूरतों को पूरा करके कंटेंट बनाना अधिक सरल और प्रभावी बनाता है।',
  'it-IT':
    'Smart Edit è uno strumento creativo facile da usare e ricco di funzionalità, ideale per promuovere romanzi, produrre fiction brevi e molto altro, rendendo la creazione di contenuti più semplice ed efficiente.',
  'nl-NL':
    'Smart Edit is een gebruiksvriendelijke en veelzijdige creatieve tool voor boekpromotie, korte dramaseries en meer, waarmee je sneller en eenvoudiger content maakt.',
  'pl-PL':
    'Smart Edit to łatwe w obsłudze i bogate w funkcje narzędzie do promocji powieści, tworzenia krótkich seriali i wielu innych treści, dzięki któremu praca jest prostsza i wydajniejsza.',
  'tr-TR':
    'Smart Edit, roman tanıtımı, kısa dizi yapımı ve daha birçok içerik ihtiyacı için kolay kullanımlı ve zengin özellikli bir yaratıcı araçtır; içerik üretimini daha basit ve verimli hale getirir.',
  'uk-UA':
    'Smart Edit — це простий у використанні та багатофункціональний інструмент для просування романів, створення коротких серіалів та інших завдань, який робить виробництво контенту легшим і ефективнішим.',
  'sv-SE':
    'Smart Edit är ett lättanvänt och funktionsrikt kreativt verktyg för bokmarknadsföring, kortdramer och mycket mer, som gör innehållsskapandet enklare och effektivare.',
  'da-DK':
    'Smart Edit er et brugervenligt og funktionsrigt kreativt værktøj til bogpromovering, korte dramaserier og meget mere, som gør indholdsproduktionen lettere og mere effektiv.',
  'fi-FI':
    'Smart Edit on helppokäyttöinen ja monipuolinen luova työkalu romaanien markkinointiin, lyhytdraamojen tuotantoon ja moneen muuhun tarpeeseen, mikä tekee sisällöntuotannosta helpompaa ja tehokkaampaa.',
  'cs-CZ':
    'Smart Edit je snadno použitelný a bohatě vybavený kreativní nástroj pro propagaci románů, tvorbu krátkých seriálů a mnoho dalších potřeb, který usnadňuje a zefektivňuje tvorbu obsahu.',
  'el-GR':
    'Το Smart Edit είναι ένα εύχρηστο και πλούσιο σε λειτουργίες δημιουργικό εργαλείο για την προώθηση μυθιστορημάτων, την παραγωγή σύντομων σειρών και πολλές ακόμη ανάγκες, κάνοντας τη δημιουργία περιεχομένου ευκολότερη και αποδοτικότερη.',
  'hu-HU':
    'A Smart Edit egy könnyen használható, sokoldalú kreatív eszköz regények népszerűsítéséhez, rövid sorozatok készítéséhez és sok más feladathoz, amely egyszerűbbé és hatékonyabbá teszi a tartalomgyártást.',
  'ro-RO':
    'Smart Edit este un instrument creativ ușor de folosit și bogat în funcții, potrivit pentru promovarea romanelor, producția de seriale scurte și multe alte nevoi, făcând crearea de conținut mai simplă și mai eficientă.',
  'bg-BG':
    'Smart Edit е лесен за използване и богат на функции творчески инструмент за популяризиране на романи, създаване на кратки сериали и много други задачи, който прави производството на съдържание по-лесно и ефективно.',
  'hr-HR':
    'Smart Edit jednostavan je i bogato opremljen kreativni alat za promociju romana, izradu kratkih serija i mnoge druge potrebe, koji stvaranje sadržaja čini lakšim i učinkovitijim.',
  'et-EE':
    'Smart Edit on lihtne ja võimalusterohke loometööriist romaanide reklaamimiseks, lühidraamade loomiseks ja paljudeks muudeks vajadusteks, muutes sisuloome lihtsamaks ja tõhusamaks.',
  'lt-LT':
    'Smart Edit yra lengvai naudojamas ir funkcionalus kūrybos įrankis romanų reklamai, trumpų serialų kūrimui ir daugeliui kitų poreikių, todėl turinį kurti tampa paprasčiau ir efektyviau.',
  'lv-LV':
    'Smart Edit ir viegli lietojams un daudzfunkcionāls radošais rīks romānu popularizēšanai, īsseriālu veidošanai un daudzām citām vajadzībām, padarot satura radīšanu vienkāršāku un efektīvāku.',
  'sk-SK':
    'Smart Edit je ľahko použiteľný a funkciami nabitý kreatívny nástroj na propagáciu románov, tvorbu krátkych seriálov a mnoho ďalších potrieb, ktorý zjednodušuje a zefektívňuje tvorbu obsahu.',
  'sl-SI':
    'Smart Edit je preprosto in zmogljivo ustvarjalno orodje za promocijo romanov, izdelavo kratkih serij in številne druge potrebe, ki omogoča lažje in učinkovitejše ustvarjanje vsebin.'
}

describe('TTS preview samples', () => {
  it('uses localized copy for every supported language when the input is empty', async () => {
    const languageCodes = TTS_LANGUAGES.map((language) => language.code)
    const previewTts = vi.fn().mockResolvedValue({
      success: false,
      message: '试听请求已记录'
    })
    const removeListener = vi.fn()

    expect(Object.keys(expectedPreviewSamples)).toEqual(languageCodes)

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listTtsCatalog: vi.fn().mockResolvedValue({
          success: true,
          message: '本地语音模型目录读取成功',
          languages: TTS_LANGUAGES,
          models: [
            {
              id: 'localized-preview-model',
              name: '本地化试听模型',
              description: '测试全部试听语言',
              engine: 'supertonic',
              licenseName: 'Test',
              licenseNote: 'Test',
              languages: languageCodes,
              voiceCount: 1,
              estimatedDownloadMb: 1,
              status: 'installed',
              statusMessage: '已安装',
              voices: [
                {
                  id: 'localized-preview-model:speaker-0',
                  modelId: 'localized-preview-model',
                  speakerId: 0,
                  name: '多语言测试音色',
                  originalName: 'speaker_0',
                  languageCodes,
                  gender: 'unknown',
                  description: '支持全部测试语言'
                }
              ]
            }
          ],
          modelDirectory: 'C:\\tts-models'
        }),
        previewTts,
        onTtsModelDownloadProgress: vi.fn(() => removeListener),
        onTtsJobProgress: vi.fn(() => removeListener)
      }
    })

    render(<TtsVoiceoverView />)

    const languageSelect = await screen.findByRole('combobox', { name: '文本语言' })
    await screen.findByRole('radio')
    const previewButton = screen.getByRole('button', { name: '试听音色：多语言测试音色' })

    for (const language of TTS_LANGUAGES) {
      fireEvent.change(languageSelect, { target: { value: language.code } })
      fireEvent.click(previewButton)

      await waitFor(() => {
        expect(previewTts).toHaveBeenLastCalledWith(
          expect.objectContaining({
            language: language.code,
            text: expectedPreviewSamples[language.code]
          })
        )
      })

      await waitFor(() => expect(previewButton).not.toBeDisabled())
    }
  }, 15_000)
})
