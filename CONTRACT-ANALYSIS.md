# Kontrat Analizi — Whitmore Sterling

Son güncelleme: 2026-08-12. Test durumu: **88 birim testi + 5 mainnet fork testi geçiyor.**

Bu belge, projedeki her kontratın ne yaptığını, paranın nereden gelip nereye gittiğini ve
neyin gerçekten çalıştığını sade bir dille anlatır. Tahmin yok — yazılan her rakam ya
zincirden okundu ya da testle doğrulandı.

---

## 1. Bir bakışta

| Kontrat | Ne yapar | Bize para kazandırır mı | Durum |
| --- | --- | --- | --- |
| `GuildBank.sol` | Hisse tokenı teminat → USDG borç | ✅ Evet, iki koldan | **Canlı** `0x3b8E15CC…` |
| `StockLpVault.sol` | Uniswap V3'te LP yapar, fee toplar | ✅ Evet, fee'nin %10'u | Yazıldı, deploy edilmedi |
| `MultiRewardStaking.sol` | STERLING stake → partner tokenı kazan | ✅ Evet, iki koldan | Yazıldı, deploy edilmedi |
| `LpZap.sol` | Tek varlıkla LP pozisyonuna giriş | ❌ Doğrudan hayır | Yazıldı, arayüze bağlanmadı |
| `WhitmoreToken.sol` | Platform tokenı ($STERLING) | ❌ Kendisi kazandırmaz | Yazıldı, deploy edilmedi |
| `StakingRewards.sol` | Eski tek-ödüllü staking | — | **Kullanılmayacak**, yerini MultiReward aldı |
| `RobinhoodGambleFi.sol` | Casino (eski proje) | — | Kapsam dışı |

---

## 2. Gelir nereden geliyor? Dört kalem

### Kalem 1 — Borç açma ücreti (canlı)

Biri USDG borç aldığında **%0.25**'i anında hazineye gider.

```
1.000 USDG borç alındı → 2,50 USDG hazineye, 997,50 USDG kullanıcıya
```

### Kalem 2 — Faiz payı (canlı)

Borçlular faiz öder. Bu faizin **%20'si** protokole kalır, %80'i USDG yatıranlara gider.
Faiz oranı doluluğa göre değişir: taban %2, havuz doldukça %32'ye kadar çıkar.

### Kalem 3 — LP kasası performans ücreti (kontrat hazır)

Kasa Uniswap'te likidite sağlar, biriken **trading fee'lerinin %10'unu** alır.
**Anaparadan hiçbir şey kesilmez** — sadece kazançtan.

### Kalem 4 — Staking (kontrat hazır)

İki koldan:
- Partner ödülü talep edilirken **%10** kesinti
- Unstake edenden **%10 ceza** — bunun tamamı kalan staker'lara dağıtılır, ve onlar
  talep ederken yine %10 platform ücreti işler

---

## 3. `GuildBank.sol` — Kredi masası (CANLI)

**Ne yapar:** Kullanıcı hisse tokenı (AAPL, NVDA, TSLA…) yatırır, karşılığında USDG
borç alır. Hissesini satmadan nakde erişir.

**Para akışı:**

```
Kullanıcı ── 10 AAPL (≈$3.000) ──► Havuz
Kullanıcı ◄── 1.350 USDG ──────── Havuz     (AAPL için %45 teminat oranı)
                                    │
                                    └── 3,37 USDG hazineye (%0.25 açma ücreti)
```

**Zincirden doğrulanan durum:**

```
havuz durumu    : açık, duraklatılmamış
listeli market  : 24 (AAPL, NVDA, TSLA, SPY, SGOV, USO…)
oracle          : Chainlink SVR, 4–17 saatlik veriler (sınır 96 saat)
borç verilebilir: 1,00 USDG        ← tek gerçek sorun
toplam borç     : 0
```

**Yani lending çalışıyor ama boş.** Teminat yatırma, oracle okuma, sağlık hesabı —
hepsini zincirde test ettim, sorunsuz. Ama havuzda **1 USDG** olduğu için kimse
anlamlı borç alamıyor. Birinin USDG tedarik etmesi gerekiyor.

**Güvenlik özellikleri:** bayat fiyat reddi, oracle duraklatma kontrolü, sequencer
kontrolü, market başına fiyat sınırları, hedef-sağlık likidasyonu, toz borç koruması,
kötü borcun açıkça kaydedilmesi.

**Testler:** 20 adet.

---

## 4. `StockLpVault.sol` — LP kasası ⭐ (constantine'in bahsettiği vault)

**Dosya: `contracts/StockLpVault.sol`** — sorduğun vault bu.

**Ne yapar:** Kullanıcı hisse tokenı + USDG yatırır. Kasa bunları Uniswap V3'te bir
likidite pozisyonuna koyar. O havuzda işlem yapan herkes fee öder, o fee kasaya birikir.
Kasa fee'yi toplar, **%10'unu bize ayırır**, kalanını pozisyona geri yatırır.

Kullanıcı Uniswap'in karmaşasını hiç görmez: aralık seçme, pozisyon açma, fee toplama,
yeniden yatırma — hepsi kasanın işi.

**Üç fonksiyon, hepsi bu:**

| Fonksiyon | Ne olur |
| --- | --- |
| `deposit()` | İki token alır, pozisyona ekler, karşılığında pay verir |
| `compound()` | Fee'yi toplar, %10'u bize, %90'ı tekrar pozisyona |
| `withdraw()` | Payları yakar, orantılı payı geri verir |

**Para akışı:**

```
Kullanıcı ── 20 AAPL + 8.000 USDG ──► Kasa ──► Uniswap pozisyonu
                                                     │
                                        İşlem hacmi  │ fee üretir
                                                     ▼
                              compound() ──► %10 hazineye
                                             %90 pozisyona geri
Kullanıcı ◄── anapara + biriken fee ──── Kasa   (çıkarken)
```

**Fork testiyle gerçek zincirde kanıtlandı.** Anvil ile Robinhood Chain'i fork ettim,
gerçek Uniswap kontratlarına karşı çalıştırdım:

```
✔ gerçek pozisyon yöneticisiyle deploy oluyor, havuzun token sırasını kullanıyor
✔ ilk yatırımda gerçek Uniswap pozisyonu açıyor (NFT kasanın üstünde)
✔ gerçek takaslardan gerçek fee kazanıyor ve %10'u hazineye ulaşıyor
✔ herkes compound çağırabiliyor
✔ çekerken anapara + fee geri dönüyor, pozisyon kapanıyor
```

Testte 10 tur gerçek alım-satım yaptırdım ve platform payının hazineye ulaştığını gördüm:
`platform cut: 0.00135 token0, 0.0000044 token1`.

**Fork testi bir hata da yakaladı:** ilk denemede 30.000 USDG'lik takas yaptırıyordum;
havuz ~$100k olduğu için fiyat uçtu ve işlem `AS` hatasıyla patladı. Mock testte bu asla
görünmezdi. Havuz derinliğine uygun boyutlara çektim.

**Testler:** 22 birim + 5 fork.

### ⚠️ Bu kasanın büyük eksiği: tam aralık

Kasa **tam aralık** (full-range) pozisyon açıyor — parayı sıfırdan sonsuza yayıyor.
Uniswap V3'te fee, fiyatın *o anda bulunduğu* aralıktaki likiditeye dağıtılır. Tam aralık
pozisyon fiyatın çok uzağına da para koyduğu için, dolar başına **5–20 kat daha az** fee
toplar.

Yani arayüzde gördüğün %187 gibi APR'lar havuzun tamamı içindir; dar aralıkta duran
profesyonel LP'ler onu alır. Biz tam aralıkta çok daha azını alırız.

**Karar:** şimdilik tam aralıkla çıkıyoruz (basit, güvenli, ucuz denetim). TVL gelince
dar aralık + yeniden dengeleme yazılacak — orası gelirin 5–20 katı ama çok daha karmaşık
ve riskli.

---

## 5. `MultiRewardStaking.sol` — Staking kasası

**Ne yapar:** Kullanıcı **STERLING** yatırır, karşılığında **partnerlerin tokenlarını**
kazanır — cashcat, pons, stonkbroker, hepsini aynı anda.

**Para akışı:**

```
Partner ── 70.000 CASHCAT ──► Kasa      (partner kendi akışını fonlar)
                                │ 7 güne yayılır
Kullanıcı ── 12.500 STERLING ──►│
                                │
Kullanıcı ◄── talep ────────────┘  %90 kullanıcıya, %10 hazineye
```

**Önemli:** kasa hiçbir token basmaz. Dağıtılan her ödül önce bir partnerin içeri
koyduğu paradır. Emisyon yok.

**Nasıl hesaplıyor:** Her ödül tokenı için tek bir sayaç tutuluyor — "şu ana kadar
stake edilmiş her 1 STERLING başına toplam X CASHCAT düştü". Sen stake ettiğinde o anki
sayaç senin adına not ediliyor. Kazancın = stake miktarın × (şimdiki sayaç − senin
sayacın). Bu yüzden sonradan gelen, gelmeden önceki ödüllerden pay alamıyor.

**Unstake cezası %10:** Çıkan kişiden kesilen %10, **kalan staker'lara** dağıtılıyor.
Yani sadık kalan kazanıyor. Kod, çıkan kişinin kendi cezasından pay almasını engelliyor —
yoksa kasanın %90'ını tutan bir balina neredeyse bedavaya çıkardı.

**Memecoin tuzağı çözüldü:** Bazı memecoinler her transferde vergi keser. Partner 10.000
gönderdiğini sanır, kasaya 9.500 ulaşır. Kasa 10.000'lik akış vaat ederse son talep
edenlere ödeme yapamaz. Bu yüzden kontrat **gerçekten gelen miktarı** ölçüyor.

**Testler:** 28 adet (birim + uçtan uca + saldırgan senaryolar). Düşmanca bir ödül
tokenıyla reentrancy saldırısı denendi ve geri çevrildi.

---

## 6. `LpZap.sol` — Tek varlıkla giriş

**Ne yapar:** Kullanıcı 0.1 ETH verir; kontrat gerekli takasları yapar, iki tarafı da
elde eder, kasaya yatırır ve payları kullanıcıya gönderir. Tek işlemde.

**Güvenlik kuralları:**
- Her takas bacağı **kasanın istediği tokenlardan birine** çıkmak zorunda
- Bacaklar toplamı, verilen miktarı aşamaz
- Artan her şey kullanıcıya geri gönderilir — kontrat hiçbir zaman bakiye tutmaz

**Testler:** 8 adet. **Arayüze henüz bağlanmadı.**

---

## 7. Test durumu

```
GuildBank (lending)                20 ✔
StockLpVault (birim)               22 ✔
StockLpVault (mainnet fork)         5 ✔   ← gerçek Uniswap'e karşı
MultiRewardStaking                 10 ✔
MultiRewardStaking (uçtan uca)     18 ✔
LpZap                               8 ✔
RobinhoodGambleFi                   5 ✔
StakingRewards (eski)               5 ✔
──────────────────────────────────────
TOPLAM                             93 ✔
```

**Fork testini çalıştırmak için:**

```bash
npm run fork:node       # anvil ile zinciri fork et (ayrı terminalde bırak)
npm run test:fork       # gerçek Uniswap'e karşı test
```

Not: Hardhat'in kendi fork özelliği bu zincirde **çalışmıyor** — public RPC arşiv düğümü
değil ve Hardhat 4663 zincirinde "No known hardfork" hatası veriyor. Bu yüzden anvil
kullanıyoruz.

---

## 8. Deploy durumu ve eksikler

| İş | Durum | Engel |
| --- | --- | --- |
| Lending havuzu | ✅ canlı | Likidite yok (1 USDG) |
| Swap (Uniswap V3) | ✅ canlı | — |
| LP kasaları | ⬜ | Denetim + gaz parası |
| Staking kasası | ⬜ | Token arzı/dağıtımı kararı |
| Zap | ⬜ | Arayüze bağlanmadı |
| Keeper sunucusu | ✅ hazır | `lending-backend/`, Docker'lı |

**Deployer cüzdanında 0,00099 ETH var** — altı kasa deploy etmeye yetmez.

### Keeper gerçekten gerekli mi?

Kısaca: **hayır, zorunlu değil.** Testle kanıtladım.

`deposit()` ve `withdraw()` zaten içeride `compound()` çağırıyor. Bir ay hiç kimse
compound çağırmasa bile, bir sonraki yatırım/çekim işleminde tüm birikmiş fee toplanıyor
ve **%10'umuz eksiksiz geliyor**. Gelir kaybolmuyor, sadece gecikiyor.

Keeper'ın işi başka: toplanmamış fee'ler pozisyonda atıl bekler, kendileri fee kazanmaz.
Test bunu ölçüyor — compound edilmemiş likidite 100, edilmiş 118. Yani keeper
**mudilerin bileşik getirisini** artırıyor, bizim gelirimizi değil.

---

## 9. Bilinen riskler

**1. LP kasasında kayma koruması yok.** Arayüz `amount0Min = 0, amount1Min = 0`
gönderiyor. Biri işlemin önüne geçip havuz fiyatını oynatırsa kullanıcı hak ettiğinden
az pay alabilir. **Kasalar canlıya çıkmadan düzeltilmeli.**

**2. Denetim yapılmadı.** `StockLpVault`, `MultiRewardStaking` ve `LpZap` kullanıcı
parası tutuyor. 93 test mantığı doğruluyor ama denetim yerine geçmez.

**3. Impermanent loss.** LP yapmak tutmakla aynı şey değil. AAPL sert yükselirse kasa
size daha çok USDG, daha az AAPL bırakır ve bu fee kazancını aşabilir. Arayüzde yazılı.

**4. Owner tek EOA.** Lending havuzunun sahibi `0x357606c8…` tek bir cüzdan. Market
listeleme, parametre değiştirme, duraklatma hep o anahtara bağlı. Üretim için multisig.

**5. Boşta kalan ödüller.** Staking kasasında, hiç kimse stake etmemişken akan ödüller
kontratta kilitli kalıyor. Kullanıcılara yanlış dağıtılmıyor ama geri de alınamıyor.

**6. Memecoin teminatı henüz yok.** cashcat/pons/stonkbroker'ı lending'e teminat olarak
eklemek için Chainlink beslemesi gerekiyor, yok. Uniswap TWAP'ından besleme üreten bir
adaptör yazılmalı — yeni kontrat, yeni denetim yüzeyi.

---

## 10. Özet: para kazanıyor muyuz?

**Şu an: hayır** — çünkü lending havuzunda 1 USDG var ve kasalar deploy edilmedi.

**Mekanizmalar çalışıyor mu: evet.** Fork testinde gerçek Uniswap havuzunda gerçek
takaslardan gerçek fee toplanıp hazineye ulaştığını gördük.

**Ne kadar kazandırır?**

Tam aralık kasayla, $400k TVL çekersek yılda kabaca **$5–15k**. Dar aralık + iyi
dengeleme ile $2M TVL'de **$50–150k** olabilir, ama o çok daha karmaşık ve riskli.

**Ama en hızlı gelir LP kasasında değil, lending'de.** Havuzda 1 USDG var. Oraya $500k
likidite gelse, %20 rezerv faktörü + %0.25 açma ücreti muhtemelen LP kasasından daha
fazla eder — ve **yeni kod, yeni denetim gerektirmez.** Sadece likidite gerekir.
