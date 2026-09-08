# Fener Bulmaca

Phaser tabanlı kelime bulma oyunudur. Oyun bileşeni `src/FenerBulmaca.vue` dosyasındadır ve dışarıyla yalnızca `engine`, `params` ve `pool` üzerinden iletişim kurar.

## Parametreler

| Param | İzinli değerler | Varsayılan | Ne işe yarar |
|---|---|---|---|
| `level` | `kolay`, `orta`, `zor` | `kolay` | Grid varsayılanını sırasıyla 8×8, 10×10 ve 12×12 belirler. |
| `gridSize` | `8`, `10`, `12`, `14` | Seviyeye göre | Grid boyutunu doğrudan belirler. |
| `rounds` | `1`–`30` | Engine tarafından | Oynanacak toplam bulmaca turu. |
| `hintCount` | `0`–`9` | `3` | Gösterilecek ipucu hakkı sayısı. |

## İçerik havuzu

Havuz isteğe bağlıdır. Her kayıt için `body` kelime olarak kullanılır. `meta.zorluk` verilmişse yalnızca seçili `params.level` ile eşleşen kayıtlar alınır. `pool` null veya yetersiz olduğunda oyun kendi deniz temalı yedek kelimelerini kullanır.

## Skorlama

Bir griddeki bütün kelimeler bulunduğunda `engine.answer(true, meta, pts)` yalnızca bir kez çağrılır. `meta`, grid boyutunu ve bulunan kelimeleri içerir; `pts` o griddeki kelime sayısıdır. Turu ve bitişi engine yönetir.

## Entegrasyon notu

Phaser hedef projede bağımlılık olarak bulunmalıdır. `src/App.vue` yalnızca yerel önizleme için sahte engine kabuğudur ve teslim bileşenine kopyalanmaz.
