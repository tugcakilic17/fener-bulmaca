# Fener Bulmaca

**Diyar:** Oyun Adası  
**Slug:** `fener-bulmaca`  
**Bileşen:** `FenerBulmaca.vue`  
**Tür:** Puanlı kelime bulma oyunu  
**İçerik havuzu:** İsteğe bağlı

Oyuncu komşu harflere sırayla tıklayarak kelimeleri oluşturur. Kelime düz bir çizgide olmak zorunda değildir. Griddeki bütün kelimeler bulunduğunda mevcut motor turu tamamlanır.

## Bileşen kontratı

Bileşen yalnızca aşağıdaki prop'ları alır:

| Prop | Tip | Zorunlu | Açıklama |
|---|---|---:|---|
| `engine` | `Object` | Evet | Oyun motorunun ref'lerini ve `answer()` metodunu içerir. |
| `params` | `Object` | Evet | Oyun ayarlarını içerir. |
| `pool` | `Array \| null` | Hayır | Kelime havuzudur. Varsayılan değer `null`dır. |

`defineEmits` kullanılmaz. Tur, puan ve oyun bitişi motor tarafından yönetilir.

## Parametreler

| Param | İzinli değerler | Varsayılan | Ne işe yarar |
|---|---|---|---|
| `level` | `kolay`, `orta`, `zor` | `kolay` | `gridSize` verilmediğinde sırasıyla 8×8, 10×10 ve 12×12 grid seçer. |
| `gridSize` | `8`, `10`, `12`, `14` | Seviyeye göre | Grid boyutunu belirler. Varsayılan kelime sayıları sırasıyla 5, 8, 9 ve 12'dir. |
| `rounds` | `3`–`30` | `3` | Toplam motor turu sayısıdır. Bileşen turu kendi ilerletmez. |
| `hintCount` | `0`–`9` | `3` | Her turda kullanılabilecek ipucu hakkını belirler. |

## Canlı ayarlar

Bileşen aşağıdaki varsayılanla `liveSettings` inject'ini kullanır:

```js
{ sizeScale: 1, elementCount: null, speed: 100 }
```

| Alan | Etki |
|---|---|
| `sizeScale` | Phaser içindeki harflerin boyutunu değiştirir. |
| `elementCount` | Doluysa kelime sayısını seçilen gridin desteklediği aralıkta değiştirir. |
| `speed` | Seçim, başarı, yıldız, fener ışığı ve ipucu animasyonlarının hızını değiştirir. |

## İçerik havuzu

Havuz kaydı aşağıdaki biçimde olabilir:

```js
[
  { id: 12, body: 'Fener', meta: { zorluk: 'kolay' } },
  { id: 13, body: 'Yelken', meta: { zorluk: 'orta' } },
]
```

Kullanılan alanlar:

- `body`: Gridde kullanılacak kelime.
- `meta.zorluk`: İsteğe bağlıdır. Varsa `params.level` ile eşleşmelidir.

`meta` veya `pool` null olabilir. Havuz yoksa, yetersizse ya da geçerli kelime içermiyorsa oyun deniz temalı yerleşik kelimelerle çalışmaya devam eder. Tekrarlanan, üç harften kısa veya gride sığmayan kelimeler elenir.

## Motor ve skorlama

- `engine.round.value` değiştiğinde yeni grid kurulur.
- Bileşen `engine.round` değerini elle artırmaz.
- Aynı turda çift cevap gönderilmesini önleyen kilit vardır.
- Bütün kelimeler bulunduğunda `engine.answer(true, meta, pts)` yalnızca bir kez çağrılır.
- `pts`, gridde bulunan kelime sayısıdır.
- `meta` içinde `tip`, `gridSize`, `bulunanKelimeler`, `ipucuKullanimi`, `tepkiSuresiMs` ve `ayarlananTurSayisi` gönderilir.
- Oyun alanındaki yerel puan, bulunan kelimenin her harfi için 10 puan artar. Bu gösterge `engine.points` veya `engine.score` değerini doğrudan değiştirmez.
- Motor son turdan sonra sonuç ekranını ve sunucuya skor gönderimini kendisi yönetir.

## İpucu davranışı

İpucu, aktif seçim yoksa bulunmamış bir kelimenin ilk harfini kısa süre parlatır. Oyuncu bir kelimenin başlangıcını seçmişse sıradaki doğru komşu harfi gösterir. Harf otomatik seçilmez. Her kullanım bir ipucu hakkını düşürür.

## Responsive ve erişilebilirlik

- Oyun 390 px genişlikte yatay kaydırma oluşturmadan çalışır.
- İpucu düğmesinin dokunma alanı 44×44 px'dir.
- Yoğun grid hücreleri için 44×44 px kuralına ekip tarafından istisna verilmiştir.
- Kullanıcıya görünen bütün metinler Türkçedir.
- Uygun metinlerde `game-*` sınıfları ve canlı yazı ölçeği desteği kullanılır.

## Dosyalar ve bağımlılık

Teslim yapısı:

```text
fener-bulmaca/
  FenerBulmaca.vue
  README.md
  assets/
    background/
      lighthouse.webp
      lighthouse_glow.webp
      sea.webp
      sky.webp
      stars.webp
    ui/
      game_title.webp
      letter_grid_frame.webp
      letter_tile.webp
      star.webp
      word_list_panel.webp
```

Tüm oyun mantığı, Phaser sahnesi, Vue şablonu ve bileşene özel stiller `FenerBulmaca.vue` içindedir. Görseller yukarıdaki `assets` klasörlerinden import edilir.

Phaser kullanımı ve dekoratif “Fener Bulmaca” başlığı ekip tarafından onaylanmıştır. Hedef projede Phaser bağımlılığı bulunmalıdır.

Yerel deneme amacıyla kullanılan `App.vue`, `main.js`, `style.css` ve eski `game/PuzzleUI.js` teslim paketine dahil edilmez.
