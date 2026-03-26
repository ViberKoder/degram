# TON Social (aka TON Media) — Эталонная децентрализованная соцсеть на TON

Версия: `0.1 (whitepaper draft)`

Дата: 2026-03-26

Ядро идеи: пользователь взаимодействует с соцсетью как с обычным Web2-приложением — **без подтверждения транзакции в кошельке** при публикации постов, лайках, подписках и ответах. Блокчейн используется так, чтобы:

1) пользователь **не отправляет** on-chain транзакции на каждое действие;
2) действия остаются **верифицируемыми** и **не зависящими** от единого сервера;
3) контент хранится в **TON Storage**, а публикации описываются **он-чейн якорями** (event anchors);
4) доступ к сайту и интерфейсам происходит через **TON Sites + TON Proxy** (ADNL/RLDP), а не через централизованный IP-ориентированный хостинг;
5) релеи (relayers) получают компенсацию через **TON Payment Network** (payment channels / conditional payments).

В документе используются термины и принципы из:
- TON DNS: домены → wallet / site / storage BagID (см. [TON DNS docs](https://docs.ton.org/foundations/web3/ton-dns.md))
- TON Proxy: HTTP ↔ ADNL (см. [TON Proxy docs](https://docs.ton.org/foundations/web3/ton-proxy.md))
- TON Sites: сервисы как ADNL-адреса (см. [TON Sites docs](https://docs.ton.org/foundations/web3/ton-sites.md))
- TON Storage: BagID, чанки, Merkle-пруфы, providers (см. [TON Storage docs](https://docs.ton.org/foundations/web3/ton-storage.md))
- TON Payment Network: off-chain payments через virtual channels, on-chain settle для споров (см. [ton-payment-network README](https://raw.githubusercontent.com/xssnick/ton-payment-network/master/README.md))
- Payment channel contract (см. [payment-channel-contract README](https://raw.githubusercontent.com/xssnick/payment-channel-contract/master/README.md))
- Реализации reverse-proxy и gateway для TON Sites: [tonutils/reverse-proxy](https://raw.githubusercontent.com/tonutils/reverse-proxy/main/README.md), [xssnick/Tonutils-Proxy](https://raw.githubusercontent.com/xssnick/Tonutils-Proxy/master/README.md)
- TON Torrent (UI для TON Storage): [xssnick/TON-Torrent](https://raw.githubusercontent.com/xssnick/TON-Torrent/master/README.md)

---

## 1. Цель и non-goals

### 1.1. Цель

Построить соцсеть “как X/Twitter” по UX:
- единая домашняя лента;
- профиль и “треды/ответы”;
- лайки и подписки;
- быстрые действия (latency как у Web2).

Но по фундаментальным принципам TON:
- идентичность резолвится через **TON DNS** и ончейн фактами;
- контент размещается в **TON Storage** с верификацией через Merkle;
- “write path” выполняется **через подписи** и **relayers**, без on-chain подтверждения действий со стороны пользователя;
- read path доступен множеству индексаций без единой точки доверия;
- интерфейс может хоститься как **TON Site** и доставляться через **TON Proxy**.

### 1.2. Non-goals (на v1)

В v1 белого документа не делаем:
- “мгновенно консистентное” ончейн состояние на каждый клик;
- on-chain хранение полного текста поста;
- централизованные серверы как единственный источник правды;
- единственный “официальный индексатор”.

Мы принимаем модель **eventual consistency**:
- действие “быстро” становится видимым после индексации;
- при необходимости пользователь/клиент может подтвердить on-chain якоря и соответствие content refs.

---

## 2. Ключевой UX-инвариант: “нет подтверждения транзакции”

Требование: “пользователь даже не замечает, что взаимодействует с блокчейном”.

В TON это означает:

1) **Пользователь не отправляет транзакцию в сеть** при публикации, лайке, ответе или подписке.
2) Пользователь подписывает **сообщения** (signed payloads) для авторизации действий, но:
   - это не “подтверждение транзакции” (как в типичном TON Connect транзакционном UX),
   - UI может выглядеть как “подпись сессии/разовый акт доверия relayer’у”.
3) Relayer (или сеть relayers) отправляет on-chain транзакции от своего имени, оплачивая gas и/или получая компенсацию через TON Payment Network.
4) Клиент обрабатывает успех как “пост/лайк принято relayer’ом и будет подтвержден on-chain”.

Важно: блокчейн всё равно используется как последняя истина.
Но “кто платит за включение в блок” и “кто делает chain submission” не пользователь.

---

## 3. Архитектурный обзор TON Social

Мы разделяем систему на 7 независимых блоков:

1) **Client Apps (TON Sites / Web clients)** — UI, генерация content bags, формирование action payloads, проверка anchor’ов.
2) **Identity & Addressing** — TON DNS и профили.
3) **Content Layer** — TON Storage (BagID + чанки + Merkle).
4) **Event Layer (он-чейн)** — контракт/шарды событий, принимающие append-only action records.
5) **Relayer Network (write-path)** — доставка signed actions и on-chain submission; оплачивается payment channels.
6) **Indexers (read-path)** — строят ленту/граф/поиск из события; выдают feed candidates.
7) **Moderation & Safety** — репорты/заморозки/оспаривание с доказуемостью.

### 3.1. Почему это соответствует TON-модели

- TON DNS уже умеет резолвить domain → wallet / site / storage bag id ([TON DNS docs](https://docs.ton.org/foundations/web3/ton-dns.md)).
- TON Sites — это HTTP интерфейс поверх ADNL/RLDP, а идентичность site — ADNL адрес ([TON Sites docs](https://docs.ton.org/foundations/web3/ton-sites.md)).
- TON Proxy выполняет HTTP ↔ ADNL bridging ([TON Proxy docs](https://docs.ton.org/foundations/web3/ton-proxy.md)).
- TON Storage обеспечивает распределённое хранение bags с Merkle-пруфами ([TON Storage docs](https://docs.ton.org/foundations/web3/ton-storage.md)).
- TON Payment Network предлагает off-chain микроплатежи через payment channels и conditional payments ([ton-payment-network README](https://raw.githubusercontent.com/xssnick/ton-payment-network/master/README.md)).

---

## 4. Идентичность: handle, профиль и TON DNS

### 4.1. Роль TON DNS

TON DNS — иерархическая on-chain система, резолвящая домены и хранящая типизированные DNS records:
- `wallet` → smart contract address;
- `site` → ADNL address TON Site;
- `storage` → TON Storage BagID;
- `dns_text` и `dns_next_resolver` ([TON DNS docs](https://docs.ton.org/foundations/web3/ton-dns.md)).

### 4.2. Что такое “профиль” в TON Social

Эталон: профиль пользователя — это комбинация:

1) **Handle**: доменное имя в DNS.
2) **Identity Root**: wallet/contract адрес в категории `wallet`.
3) **Profile metadata**: минимальные ончейн/проверяемые данные:
   - отображаемое имя;
   - avatar/content refs;
   - публичные ключи/делегации для подписи action payloads (подписи).

Два ключевых требования:
- профиль должен быть адресуемым и проверяемым без доверия к центральному серверу;
- смена профиля должна быть описываема как “событие обновления” или как обновление state в Profile contract.

### 4.3. Как выглядит резолв при загрузке

Когда клиент хочет открыть `@alice`:
1) резолвит `alice.ton` → `wallet`/`site`/`storage` records через TON DNS;
2) получает ADNL-адрес профиля (если профиль также развёрнут как TON Site) и/или content refs;
3) загружает профиль и контент через соответствующий слой (TON Storage / TON Sites).

---

## 5. Модель контента: TON Storage как источник “текста и медиа”

### 5.1. BagID как стабильный content identifier

TON Storage организует файлы в **bags**, каждый bag имеет уникальный 256-bit `BagID`, вычисляемый из torrent info cell; файлы раскладываются на чанки по 128 KiB с Merkle деревом для проверки чанков ([TON Storage docs](https://docs.ton.org/foundations/web3/ton-storage.md)).

В TON Social:
- каждый пост публикуется как **контент-объект** (content object) в TON Storage;
- событие поста содержит **content_ref**, равный BagID (или BagID + путь/метаданные).

### 5.2. Структура content objects

Для текста:
- `meta.json` (или TL/JSON в пределах заданной схемы);
- `body.txt` (опционально чанками);
- `render.html` не является обязательным (рендер делается клиентом).

Для медиа:
- отдельно создаются bags для каждой композиции (или один bag для набора файлов);
- metadata содержит:
  - список файлов и mime типов;
  - хэши чанков/merkle proof anchors (если требуется);
  - ссылки для lazy loading.

### 5.3. Провайдеры хранения

TON Storage предусматривает storage providers: узлы, которые:
- хранят bags;
- принимают оплаты и выдают proof’ы наличия через Merkle challenge/settlement ([TON Storage docs](https://docs.ton.org/foundations/web3/ton-storage.md)).

Клиент может:
- хранить и читать через любой provider (конкурентность);
- при необходимости — качать через торрент-подобный P2P протокол.

Практическая связка для UX:
- TON Torrent UI/логика показывает пользователю bag/metafile workflow ([TON-Torrent README](https://raw.githubusercontent.com/xssnick/TON-Torrent/master/README.md)).
- storage providers можно хостить самостоятельно или покупать storage у провайдера.

---

## 6. Модель событий: append-only action log на TON

### 6.1. Зачем on-chain события

Соцсеть должна быть децентрализованной не только “по UI”, но и по правде.
Поэтому:
- лайк/подписка/ответ/пост — это **события**;
- текущие состояния (“я лайкнул” / “я подписан”) являются производными от событий и строятся indexers.

### 6.2. Что хранится on-chain

На on-chain хранится минимум:
- `action_id` (уникальный идентификатор);
- автор/инициатор (wallet address);
- тип action (`post`, `reply`, `like`, `follow`, `profile_update`, `report`);
- `content_ref` (BagID либо bag + path);
- `target_ref` (например: replyTo action_id или post_id hash);
- `session_nonce`/`ticket_nonce` и `timestamp_ms`;
- верифицируемая авторизация (подпись/якорь сессии или ключа).

Полный текст/медиа — не храним на chain. Он лежит в TON Storage.

### 6.3. Как шардировать event layer

В эталоне:
- делаем “event shards” по `hash(action_id)` или по `author`/`handle` пространствам;
- indexers могут читать часть shards и/или периодически подтягивать новые события.

Цель: горизонтальная масштабируемость и способность добавлять больше indexers без ломки данных.

---

## 7. Relayer write-path: сессия вместо транзакций на каждый клик

Это ключевой раздел “как добиться UX без confirmation”.

### 7.1. Actor’ы

- **User Client**: приложение пользователя, генерирует content bags, собирает payload и подписывает.
- **Relayer**: принимает signed action envelopes, проверяет формат/авторизацию и отправляет on-chain tx.
- **Indexer**: читает on-chain action log и строит feed.

### 7.2. Authorization Session Ticket

Вместо подписи каждого действия отдельным on-chain подтверждением, пользователь подписывает **один Session Ticket** (или “delegation”) на ограниченный срок.

Session Ticket содержит:
1) `subject_wallet` (адрес пользователя);
2) `relayer_id` или wildcard (каким relayer’ам разрешено);
3) `valid_until_ms` (expiration);
4) `scopes` (какие action types разрешены: `post`, `reply`, `like`, `follow`);
5) `nonce` (anti replay);
6) `ticket_id` = hash(payload).

Пользователь подписывает ticket payload один раз (при login/первом открытии сессии).

Дальше:
- клиент отправляет relayer’у action payload вместе с `ticket_id` и signature/anchoring материалом,
- relayer submit’ит on-chain action records, используя проверяемую авторизацию.

Ключ: on-chain контракт должен проверять, что action подписан/разрешён этим ticket’ом.
При этом пользователь не должен участвовать в каждом action отдельно.

### 7.3. Базовый Action Envelope

Стандартизируем формат “envelope”, чтобы indexers/relayers работали одинаково:

```
ActionEnvelope {
  action_id: hash,
  action_type: enum,
  author_wallet: address,
  content_ref: BagID|BagRef,
  target_ref: PostActionId|UserHandleRef|null,
  timestamp_ms: uint64,
  ticket_id: string,
  ticket_signature: bytes (или proof signature),
  action_nonce: uint64 (anti replay в рамках ticket),
  payload_hash: hash(payload_fields),
}
```

`action_id` может быть:
- hash всех полей (domain-separated),
- или вычислением “deterministic id” с учетом `author_wallet + action_nonce`.

### 7.4. Write flow: публикация поста (UX сценарий)

**Шаг 0: Boot / Login**
1) пользователь открывает TON Social в TON Sites/браузере;
2) TON Connect / Wallet UI показывает “Разрешить relayer’у подписывать действия на период X минут” (получаем Session Ticket).
3) клиент кэширует ticket в памяти и/или локально на устройстве (не на chain).

**Шаг 1: Создание контента**
1) клиент формирует content object (например, JSON schema + text);
2) клиент создает bag в TON Storage через provider flow:
   - bag info → BagID,
   - upload чанки (или publish via storage client).
3) клиент получает `content_ref = BagID`.

**Шаг 2: Формирование action**
1) клиент собирает `ActionEnvelope` с `content_ref`, `reply_to` (если ответ), timestamp и action nonce;
2) вместо “подпиши каждый раз” он использует уже выданный ticket signature.

**Шаг 3: Отправка в relayer**
1) клиент отправляет ActionEnvelope на один из relayer endpoints (или в DHT-like routing);
2) UI показывает “Опубликовано (будет подтверждено)” — без транзакционного окна.

**Шаг 4: On-chain submission**
1) relayer валидирует:
   - что ticket не истёк,
   - что scopes подходят,
   - что action nonce не использован,
   - что content_ref соответствует допустимому формату.
2) relayer отправляет транзакцию в event shard contract:
   - contract проверяет validity и append’ит событие.

**Шаг 5: Indexing и отображение**
1) индексатор получает новое событие,
2) строит feed candidates и отдаёт клиенту.

Пользователь больше не видит on-chain confirmation как “опубликовать транзакцию” — он видит обновление как обычный feed.

### 7.5. Write flow: лайк/подписка/ответ

Аналогично:
- клиент генерирует action envelope:
  - `like` содержит `target_ref = action_id post/reply`;
  - `follow` содержит `target_ref = author_wallet` (или handle resolved wallet).
- action nonce инкрементируется в рамках ticket.

Relayer submit’ит on-chain.

### 7.6. Бэтчинг и снижение cost

Релеи могут:
- батчить множество action submissions в одну транзакцию (batch contract method) либо пакетировать по времени;
- заменять на более дешёвые режимы консолидации.

Это критично для массового usage (тысячи пользователей).

---

## 8. Чтение (read-path): indexers, feed кандидаты и проверка

### 8.1. Кто формирует ленту

В dецентрализованном подходе ленту нельзя делать “одним сервером”, который ранжирует на доверии.

Эталон:
- indexer(s) — отдельные независимые участники сети;
- каждый indexer строит off-chain агрегаты:
  - граф подписок,
  - reply trees,
  - counts (likes, replies),
  - кандидатный home feed.
- клиент запрашивает у выбранного indexer’a feed candidates.

### 8.2. Проверка доверия

Чтобы “это было не только красиво, но и правда”, клиент способен:
- проверять, что event anchors существуют on-chain по `action_id` и `content_ref`;
- что content_ref действительно соответствует содержимому, загруженному из TON Storage (пруф/merkle verification).

Это снимает риск “один индексатор соврал или подменил контент”.

### 8.3. Ранжирование

Ранжирование может быть любым (алгоритмы X/Twitter-подобные):
- recency,
- graph proximity,
- интересы пользователя,
- engagement features.

Но источник истины — on-chain action events и storage refs.

---

## 9. TON Sites / TON Proxy: как доставлять фронт и API без IP-экспозиции

### 9.1. TON Sites как фронтенд и read-only API

TON Sites — HTTP-сервисы поверх ADNL/RLDP, идентифицируемые ADNL адресом, а не IP [TON Sites docs](https://docs.ton.org/foundations/web3/ton-sites.md).

Это позволяет:
- не светить прямой IP в URL и HTTP layer;
- единообразно хостить фронтенд в TON сети.

### 9.2. TON Proxy как мост для обычного браузера

TON Proxy делает HTTP ↔ ADNL bridge; для `.ton` домена прокси резолвит DNS → ADNL и проксирует RLDP запросы [TON Proxy docs](https://docs.ton.org/foundations/web3/ton-proxy.md).

Это закрывает “мы опять сделали Web2 server” и встраивает UX в TON web3 сеть.

### 9.3. Reverse proxy на стороне хостинга

Для реального развёртывания фронта на Web2 серверах используется reverse-proxy:
- `tonutils-reverse-proxy` (упрощает доменную привязку и keygen) [tonutils/reverse-proxy README](https://raw.githubusercontent.com/tonutils/reverse-proxy/main/README.md)
- `tonutils-proxy` как “web3 gateway” и для тестов/локальных сценариев [Tonutils-Proxy README](https://raw.githubusercontent.com/xssnick/Tonutils-Proxy/master/README.md)

В документах прямо указано, что proxy добавляет заголовки `X-Adnl-Ip` и `X-Adnl-Id` в запросах — это полезно для логирования rate limiting, но не для “раскрытия личности” на HTTP-уровне [тонutils-reverse-proxy README](https://raw.githubusercontent.com/tonutils/reverse-proxy/main/README.md).

---

## 10. Payments и экономика relayer’ов

Поскольку пользователь не делает on-chain tx, нужно понять, кто платит за:
- gas на запись событий,
- сетевую доставку relayer’ом,
- возможно storage provider costs для публикации контента.

### 10.1. TON Payment Network как базовая экономика

TON Payment Network построена на:
- **payment channels** (on-chain) и
- **virtual channels** (off-chain),
- conditional payments и fallback на on-chain settlement при споре,
- privacy через garlic routing.

Опорные тезисы из README:
- off-chain операции возможны “без network fees” и на случай споров есть settlement на chain [ton-payment-network README](https://raw.githubusercontent.com/xssnick/ton-payment-network/master/README.md).
- при виртуальной маршрутизации возможен путь A→B→C без прямого on-chain A→C, что важно для p2p инфраструктуры.
- безопасность: средний узел не может украсть funds, потому что для выполнения нужны условные подтверждения.

### 10.2. Как оплатить relayer в контексте соцсети

Есть два приемлемых подхода:

**Подход A (простота): оплачивает пользователь при login**
- пользователь переводит небольшой депозит на баланс “relayer service” (например, в виде off-chain payment credits).
- relayer получает компенсацию при submit.
- минус: надо решить UX пополнения баланса.

**Подход B (тонкий dецентрализованный): микроплатежи за traffic пакеты**
- каждый action delivery/submit получает micropayment,
- micropayment идёт через Payment Network,
- relayer конкурируют между собой.

С точки зрения архитектуры, TON Proxy/TON Sites могут использовать эту платежную модель (в материалах TON Proxy упомянута оплата трафика через payment network) [телеграф-статья TON Proxy](https://telegra.ph/TON-Proxy-Introducing-optional-traffic-micro-payments-and-privacy-via-garlic-routing-03-08).

### 10.3. Payment channel contract как механизм доверия

Payment channel contract обеспечивает:
- on-chain channels для двух ключей,
- возможность virtual channels,
- conditional payments,
- и fallback при некооперативном закрытии.

См. [payment-channel-contract README](https://raw.githubusercontent.com/xssnick/payment-channel-contract/master/README.md).

---

## 11. Антиспам, безопасность и защита от злоупотреблений

### 11.1. Replay protection

Минимизируем злоупотребления:
- ticket nonce (в пределах session),
- action nonce (в пределах ticket),
- expiration valid_until_ms.

Контракт event shard обязан:
- отвергать actions с уже использованным action nonce;
- отвергать ticket’ы, истекшие по времени;
- проверять scopes.

### 11.2. Anti-sybil и экономика участия

Сеть должна защищаться от “фрикеров”, которые фармят likes/follows.

Эталонные методы:
- минимальная ставка (stake) или регистрационный депозит при первичной активности (например, через fee-lock в Profile contract);
- rate limiting на уровне relayer’ов + on-chain require constraints;
- “proof of personhood” — в более поздних фазах.

### 11.3. Модель угроз relayer’ов

Relayer считается не доверенным:
- он может задерживать действия (liveness issue),
- но не может подменить content_ref или author_wallet, если подписи и проверки enforce’ятся.

Контракт должен проверять:
- envelope fields consistency,
- что content_ref относится к допустимому формату/типу,
- что signature/authorization ticket валиден.

### 11.4. Конфиденциальность

Поскольку upload контента идёт в TON Storage и ссылки на bags публично доступны через event anchors, “идеальная приватность” текста невозможна.

Но можно:
- шифровать содержимое post’а (если это предусмотрено content schema);
- хранить только encrypted content_ref и decrypt keys в пользовательских кошельках;
- тогда “читать можно только тем, у кого есть ключ” (это отдельная версия protocol).

От уровня доставки:
- TON Proxy/ADNL шифрование обеспечивает, что HTTP-уровень не раскрывает IP-связность напрямую [TON Proxy docs](https://docs.ton.org/foundations/web3/ton-proxy.md).

---

## 12. Модерация и “социальная безопасность” без централизма

### 12.1. Репорты как события

Репорт — это тоже append-only action:
- `report` содержит:
  - target_ref (post/action id),
  - reason code,
  - optional evidence refs (content refs),
  - timestamp.

Indexers строят “report counts”, но решение “скрывать/замораживать” делается системой доказуемых правил:
- простые правила (автоматические thresholds),
- или голосование/jury на основе stake (future).

### 12.2. Challenge и оспаривание

В эталоне:
- всегда есть возможность оспорить moderation decision путем предоставления доказательств content refs и signature anchors.

### 12.3. Anti-edit / immutability

Посты append-only.
Если нужно редактирование:
- создаётся новое событие `post_edit` с ссылкой на предыдущий пост и новым content_ref,
- клиент отображает актуальную версию согласно правилам.

---

## 13. Контракты (эталонный набор модулей)

Ниже “контрактный” список для понимания инженерами. Конкретные реализации (Tolk/FunC/Tact) могут отличаться, но API концептуально должно совпадать.

### 13.1. Profile / Identity Contracts

1) `ProfileContract`
   - хранит:
     - handle metadata refs,
     - public keys / verification rules (для подписей action envelopes),
     - опционально: session delegation policy.
   - может работать как “subject” для ticket scope.

2) `Handle-to-Profile binding`
   - строится на TON DNS (`dns_smc_address`/`dns_text`), либо через on-chain resolver.

### 13.2. Event Shard Contracts

`SocialEventShard`
- append-only ledger событий:
  - verify ticket signature / scope,
  - check action nonce unused,
  - verify payload hash consistency,
  - store action record keyed by action_id.
- может поддерживать batch append to reduce gas.

### 13.3. Content schema validation (опционально)

`ContentTypeRegistry`:
- позволяет контракту проверять “content schema id” и длины/ограничения,
- не проверяет весь контент (он в storage), но блокирует мусор.

---

## 14. Протоколные схемы (точность “чтобы разработчики не гадали”)

### 14.1. Ticket Payload

```
TicketPayload {
  version: uint8,
  subject_wallet: address,
  relayer_id: bytes (or wildcard),
  valid_until_ms: uint64,
  scopes: bitmask,
  ticket_nonce: uint64,
  chain_id: uint32,
}
```

`ticket_id = hash(domain_separator || payload_bytes)`.

### 14.2. Action Payload

```
ActionPayload {
  version: uint8,
  action_id: hash,
  action_type: enum,
  author_wallet: address,
  content_ref: BagID|BagRef,
  target_ref: bytes|null,
  timestamp_ms: uint64,
  ticket_id: bytes,
  action_nonce: uint64,
}
```

`action_id` может быть computed как:
- `hash(author_wallet || action_nonce || timestamp_ms || content_ref || target_ref || action_type)`.

### 14.3. Envelope

Envelope включает ticket signature material.

---

## 15. Индексаторы: спецификация “feed как кандидаты”

### 15.1. Почему не делать ленту только on-chain

Ончейн выборка не может обслужить:
- поиск/фильтрацию/сложные ранжирования,
- построение graph proximity,
- актуальные counters и “рекомендации”.

Поэтому indexers:
- читают event shards,
- строят off-chain view моделей,
- отдают клиентам feed candidates.

### 15.2. Формат feed response

Клиенту отдается:
- list of action_id / anchor data,
- и минимальные поля для рендера:
  - author_handle,
  - content_ref,
  - likesCount/repliesCount (предвычислено indexer’ом),
  - проверочные поля (по желанию клиента).

Если indexer ошибся:
- клиент может свериться on-chain по action_id и content_ref.

---

## 16. Доступность, репликация и “контент не пропадет”

### 16.1. Проверяемость контента

При загрузке поста:
1) клиент скачивает meta/body/chunks из TON Storage по BagID;
2) валидирует Merkle proofs;
3) сверяет hash anchors (если schema это требует).

### 16.2. Репликация и providers

TON Storage предполагает:
- DHT peer discovery по BagID,
- providers, которые хранят bags за оплату.

Поэтому контент переживает:
- падение single provider’а,
- перетоки трафика между providers.

---

## 17. Hosting: как развернуть “TON Social” как TON Site

### 17.1. Развёртывание

Теоретически:
- frontend как static bundle может быть отдан как TON Site (HTTP server на localhost/80 или 443);
- reverse-proxy связывает ADNL адрес сайта с `.ton` доменом.

Решения и подходы:
- reverse proxy: [tonutils/reverse-proxy](https://raw.githubusercontent.com/tonutils/reverse-proxy/main/README.md)
- gateway: [Tonutils-Proxy](https://raw.githubusercontent.com/xssnick/Tonutils-Proxy/master/README.md)

### 17.2. Где живёт API

Слой API может быть:
- read-only для feed/profile (если indexers/aggregator’ы).
- write-path endpoint’ы принимают action envelopes от клиентов и отдают в relayers.

Критично: write-path backend не обязан быть единственным — он может быть множественным входом (relayer endpoints), но on-chain contracts фиксируют истину.

---

## 18. Дорожная карта (от “concept” к production без потери TON-идеи)

### v0: Hybrid MVP (быстро показать UX)
- content → TON Storage
- event anchors → on-chain event shard (или временно запись anchors + off-chain states)
- indexers → off-chain
- relayers → централизованный relayer пока, но session ticket UX уже работает без per-action confirmations.

### v1: Permissionless relayers
- несколько relayer endpoints
- релеи конкурируют по цене/latency за payment network
- контракт верифицирует ticket scopes и action nonces

### v2: Permissionless indexers
- indexer selection/pinning клиентом
- проверка anchors на стороне клиента
- независимый граф и ранжирование

### v3: TON Proxy 2.x privacy layer (garlic routing)
- подключить промежуточные TON Proxy nodes
- политика оплаты через TON Payment Network
- улучшение приватности end-user и anti-DoS для сайтов

---

## 19. Критические решения и компромиссы (честно)

1) “нет подтверждения транзакции” у пользователя означает:
   - relayer оплачивает gas и делает submission
   - user подписывает ticket один раз вместо каждого action

2) “полностью децентрализованная лента” потребует:
   - multiple indexers,
   - формат проверки anchor’ов,
   - возможно, client-side merge strategies.

3) “контент без доверия”:
   - требует TON Storage и проверку Merkle чанков.

4) Экономика:
   - payment network и конкуренция relayers решают cost, но требуют инженерной обвязки.

---

## 20. Заключение: “TON Media” как продукт, а не демка

TON Social в эталонном виде — это не попытка “прикрутить блокчейн к Twitter”.
Это попытка переписать инфраструктурные гарантии:

- идентичность: TON DNS,
- доставка и hosting: TON Sites + TON Proxy,
- хранение: TON Storage + TON Torrents,
- платежи для relayers: TON Payment Network,
- контент и события: on-chain anchors + storage verified content.

При этом UX остаётся “как обычная соцсеть”:
- пользователь не видит подтверждение транзакции на каждый клик,
- все ончейн эффекты скрыты внутри relayer/network layer.

---

## Приложение A: Мини-диаграмма write-path

```
User Client (TON Site)
  |
  | 1) sign Session Ticket (scopes, valid_until_ms)
  v
Relayer Network (one of N relayers)
  |
  | 2) receives ActionEnvelope + ticket_id/signature
  | 3) verifies scopes/nonces (off-chain) and submits tx
  v
Event Shard Contract (on-chain)
  |
  | 4) emits/records action_id -> indexers
  v
Indexers (one of M indexers)
  |
  | 5) feed candidates -> client
  v
Client downloads content_ref from TON Storage -> verifies Merkle
```

---

## Приложение B: Справочные ссылки на TON primitives

- TON DNS: https://docs.ton.org/foundations/web3/ton-dns.md
- TON Proxy: https://docs.ton.org/foundations/web3/ton-proxy.md
- TON Sites: https://docs.ton.org/foundations/web3/ton-sites.md
- TON Storage: https://docs.ton.org/foundations/web3/ton-storage.md
- TON Payment Network: https://raw.githubusercontent.com/xssnick/ton-payment-network/master/README.md
- Payment channel contract: https://raw.githubusercontent.com/xssnick/payment-channel-contract/master/README.md
- reverse-proxy (tonutils): https://raw.githubusercontent.com/tonutils/reverse-proxy/main/README.md
- Tonutils-Proxy: https://raw.githubusercontent.com/xssnick/Tonutils-Proxy/master/README.md
- TON-Torrent: https://raw.githubusercontent.com/xssnick/TON-Torrent/master/README.md

