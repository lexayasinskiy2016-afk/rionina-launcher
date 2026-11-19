// Английский язык интерфейса. Перевод на лету: заменяет русские фразы во всём окне,
// включая уведомления и то, что появляется позже. Фразы с числами и именами — по шаблонам.
const LANG = (() => { try { return localStorage.getItem('rionina-lang') || 'ru'; } catch { return 'ru'; } })();

const EN = {
  // Вход
  'Войдите, чтобы играть в Minecraft': 'Sign in to play Minecraft', 'Войти через Microsoft': 'Sign in with Microsoft',
  'Если Minecraft куплен — вход через почту Microsoft': 'Own Minecraft? Sign in with your Microsoft email', 'или': 'or',
  'Вход': 'Sign in', 'Регистрация': 'Sign up', 'Ник': 'Nickname', 'Пароль': 'Password', 'Повторите пароль': 'Repeat password',
  'Войти в Rionina ID': 'Sign in to Rionina ID', 'Создать аккаунт': 'Create account', 'Пароли не совпадают': 'Passwords do not match',
  'Ник защищён паролем — никто не сможет зайти под вашим ником': 'Your nickname is password-protected — nobody else can use it',
  'Назад': 'Back', 'Вход отменён': 'Sign-in cancelled',
  'Сервер Rionina недоступен — аккаунт защищён паролем на этом компьютере. Друзья появятся, когда сервер заработает.': 'Rionina server is unavailable — your account is password-protected on this computer. Friends will work once the server is up.',
  // Навигация
  'Новости': 'News', 'Версии': 'Versions', 'Скины': 'Skins', 'Моды': 'Mods', 'ИИ-сборки': 'AI packs', 'Шейдеры': 'Shaders',
  'Ресурс-паки': 'Resource packs', 'Сундуки': 'Chests', 'Скриншоты': 'Screenshots', 'Серверы': 'Servers', 'Друзья': 'Friends',
  'Профиль': 'Profile', 'Настройки': 'Settings', 'Выйти': 'Sign out',
  // Общие
  'Играть': 'Play', 'Закрыть игру': 'Close game', 'Запуск…': 'Launching…', 'Игра запущена': 'Game is running', 'Установка…': 'Installing…',
  'Выбранная версия': 'Selected version', '(будет установлена)': '(will be installed)', 'Установить': 'Install', 'Установлено': 'Installed',
  '✓ Установлено': '✓ Installed', 'Удалить': 'Delete', 'Закрыть': 'Close', 'Открыть': 'Open', 'Сохранить': 'Save', 'Добавить': 'Add',
  '＋ Добавить': '＋ Add', 'Отменить': 'Undo', 'Повторить': 'Retry', 'Загрузка…': 'Loading…', 'Проверка…': 'Checking…', 'Подготовка': 'Preparing',
  'Ничего не найдено': 'Nothing found', 'Показать ещё': 'Show more', 'Популярные': 'Popular', 'Новые': 'Newest', 'Все': 'All', 'Позже': 'Later',
  'Точно удалить?': 'Delete for sure?', 'По умолчанию': 'Default', 'Принять': 'Accept', 'Отклонить': 'Decline', 'Отправить': 'Send',
  // Новости и версии
  'Что нового в Minecraft': "What's new in Minecraft", 'Все выпуски Minecraft: Java Edition — от самой первой до самой новой': 'Every Minecraft: Java Edition release — from the very first to the newest',
  'Мои версии': 'My versions', 'Релизы': 'Releases', 'Снапшоты': 'Snapshots', 'Поиск версии': 'Search versions', 'Релиз': 'Release', 'Снапшот': 'Snapshot',
  '· Новая': '· New', 'В очереди': 'Queued', 'Здесь появятся установленные версии. Выберите любую ниже и нажмите «Установить».': 'Installed versions appear here. Pick any below and click “Install”.',
  'Выберите версию во вкладке «Версии»': 'Choose a version in the “Versions” tab',
  // Скины
  'Создайте свой или выберите готовый': 'Create your own or pick a ready-made one', 'Мои скины': 'My skins', 'Готовые': 'Ready-made', 'Редактор': 'Editor',
  'Надеть': 'Wear', '✓ Надет': '✓ Wearing', 'Надет': 'Wearing', 'Ходьба': 'Walking', 'Бег': 'Running', 'Стоит': 'Standing', 'Анимация': 'Animation',
  'Плащ': 'Cape', 'Эффект': 'Effect', 'Нет': 'None', '＋ Создать скин': '＋ Create skin', 'Загрузить PNG': 'Upload PNG', '🎲 Случайный скин': '🎲 Random skin',
  'Второй слой (одежда сверху)': 'Second layer (outerwear)', 'Зеркально (руки и ноги)': 'Mirror (arms and legs)', 'Название скина': 'Skin name',
  'Классика': 'Classic', 'Тонкие руки': 'Slim arms', 'Карандаш': 'Pencil', 'Заливка': 'Fill', 'Ластик': 'Eraser', 'Пипетка': 'Picker',
  'Подсказка: области подписаны — голова, тело, руки, ноги. Изменения сразу видны на 3D-модели.': 'Tip: areas are labelled — head, body, arms, legs. Changes show on the 3D model instantly.',
  'Голова': 'Head', 'Тело': 'Body', 'П. рука': 'R. arm', 'Л. рука': 'L. arm', 'П. нога': 'R. leg', 'Л. нога': 'L. leg', 'Мой скин': 'My skin', 'Случайный': 'Random',
  'Скин сохранён в «Мои скины»': 'Skin saved to “My skins”', 'Нужен скин 64×64 (или старый 64×32)': 'The skin must be 64×64 (or legacy 64×32)',
  'Офлайн: скин виден вам в одиночной игре. Эффекты видны в лаунчере.': 'Offline: you see your skin in singleplayer. Effects show in the launcher.',
  'Надетый скин загружается в ваш профиль Minecraft — его видят все.': 'Your skin is uploaded to your Minecraft profile — everyone sees it.',
  'Ваш персонаж — нажмите, чтобы сменить скин': 'Your character — click to change skin',
  'Пока пусто — возьмите готовый скин, создайте свой или откройте кейс.': 'Empty for now — take a ready-made skin, make your own or open a chest.',
  'Плащи выпадают из сундуков — вкладка «Сундуки»': 'Capes drop from chests — see the “Chests” tab', 'Плащ для Rionina Pro': 'Rionina Pro cape',
  // Названия скинов, плащей, эффектов
  'Путешественник': 'Traveler', 'Исследовательница': 'Explorer', 'Хакер': 'Hacker', 'Шахтёр': 'Miner', 'Принцесса': 'Princess', 'Рыцарь': 'Knight',
  'Ниндзя': 'Ninja', 'Космонавт': 'Astronaut', 'Повар': 'Chef', 'Футболист': 'Footballer', 'Бизнесмен': 'Businessman', 'Зомби-панк': 'Zombie punk',
  'Повелитель огня': 'Fire Lord', 'Ледяная королева': 'Ice Queen', 'Золотой рыцарь': 'Golden Knight', 'Галактический странник': 'Galactic Wanderer',
  'Неоновый гонщик': 'Neon Racer', 'Изумрудный страж': 'Emerald Guardian', 'Тень': 'Shadow', 'Самурай': 'Samurai', 'Драконий лорд': 'Dragon Lord',
  'Кибер-самурай': 'Cyber Samurai', 'Морозный маг': 'Frost Mage', 'Королева Rionina': 'Queen of Rionina', 'Странник Пустоты': 'Void Walker', 'Нефритовый воин': 'Jade Warrior',
  'Плащ Rionina': 'Rionina Cape', 'Ночной плащ': 'Night Cape', 'Лесной плащ': 'Forest Cape', 'Плащ сердец': 'Cape of Hearts', 'Плащ бури': 'Storm Cape',
  'Огненный плащ': 'Fire Cape', 'Звёздный плащ': 'Star Cape', 'Королевский плащ': 'Royal Cape', 'Плащ Pro': 'Pro Cape',
  'Молния': 'Lightning', 'Огненная аура': 'Fire aura', 'Снегопад': 'Snowfall', 'Сердечки': 'Hearts', 'Золотые искры': 'Golden sparks', 'Радужный нимб': 'Rainbow halo',
  'Пузыри': 'Bubbles', 'Портал Края': 'End portal', 'Код': 'Code', 'Божественная аура': 'Divine aura', 'Конфетти': 'Confetti', 'Галактика': 'Galaxy',
  'Обычный': 'Common', 'Редкий': 'Rare', 'Эпический': 'Epic', 'Легендарный': 'Legendary',
  // Моды, шейдеры, паки
  'Тысячи модов с Modrinth — установка в один клик': 'Thousands of Modrinth mods — one-click install', 'Сборка с модами': 'Modded build',
  'Выберите загрузчик и версию — лаунчер сам установит Minecraft и загрузчик.': 'Pick a loader and version — the launcher installs Minecraft and the loader.',
  'Создать сборку': 'Create build', 'Создаём…': 'Creating…', 'Сборка': 'Build', 'Поиск на Modrinth': 'Search Modrinth', 'Каталог —': 'Catalog —',
  'Красивый свет, тени и вода': 'Beautiful light, shadows and water', 'Новые текстуры для блоков и предметов': 'New textures for blocks and items',
  '✨ Для шейдеров нужна сборка Fabric — Iris и Sodium установятся автоматически, а шейдер включится сам.': '✨ Shaders need a Fabric build — Iris and Sodium install automatically and the shader turns on by itself.',
  'Паки от Rionina': 'Packs by Rionina', 'Каталог Modrinth': 'Modrinth catalog', 'Нет сборки Fabric': 'No Fabric build', 'Нет сборки с модами': 'No modded build',
  'Нет установленных версий': 'No installed versions', 'Нет сборок Fabric': 'No Fabric builds', 'Пока ничего не установлено': 'Nothing installed yet',
  'Ничего не найдено для этой версии': 'Nothing found for this version', 'Сначала создайте сборку Fabric во вкладке «Моды»': 'Create a Fabric build in the “Mods” tab first',
  // ИИ
  'ИИ собирает сборки из модов и создаёт новые моды — модерация проверяет всё': 'AI builds modpacks and creates new mods — moderation checks everything',
  'Сборка из модов': 'Modpack', '✨ Новый мод от ИИ': '✨ New AI mod', '✨ Собрать': '✨ Build', '✨ Создать мод': '✨ Create mod', 'ИИ думает…': 'AI is thinking…',
  'Нейросеть рисует…': 'AI is drawing…', 'Сборки игроков': 'Player packs', 'Мои опубликованные': 'My published', 'Мои ИИ-моды в этой версии': 'My AI mods in this version',
  'Собрал встроенный ИИ-помощник': 'Built by the built-in AI helper', 'Собрала нейросеть': 'Built by the neural network', 'Установите Minecraft 1.21.4 или новее': 'Install Minecraft 1.21.4 or newer',
  'Сначала установите Minecraft 1.21.4 или новее во вкладке «Версии»': 'Install Minecraft 1.21.4 or newer in the “Versions” tab first',
  '🔑 Подключите нейросеть — бесплатно': '🔑 Connect the AI — free', 'и войдите через Google.': 'and sign in with Google.', 'и скопируйте ключ (начинается с «AIza»).': 'and copy the key (starts with “AIza”).',
  'Вставьте его сюда — он хранится зашифрованным только на этом компьютере.': 'Paste it here — it is stored encrypted on this computer only.',
  'Нейросеть подключена ✨': 'AI connected ✨', 'сменить ключ': 'change key', 'Устанавливаем…': 'Installing…', 'Ставим моды…': 'Installing mods…',
  'Например: выживание с магией и драконами, красивая графика, чтобы не лагало': 'E.g.: survival with magic and dragons, nice graphics, no lag',
  'Например: огненный меч, который поджигает врагов, и яблоко, которое даёт скорость': 'E.g.: a fire sword that sets enemies alight and an apple that gives speed',
  'Пока нет опубликованных сборок — соберите свою и нажмите «Опубликовать для всех»': 'No published packs yet — build yours and click “Publish for everyone”',
  'Выберите версию Minecraft': 'Choose a Minecraft version', 'Меч': 'Sword', 'Топор': 'Axe', 'Кирка': 'Pickaxe', 'Лопата': 'Shovel', 'Лук': 'Bow', 'Еда': 'Food',
  'Шлем': 'Helmet', 'Нагрудник': 'Chestplate', 'Поножи': 'Leggings', 'Ботинки': 'Boots', 'Предмет': 'Item',
  'Выживание с магией и драконами': 'Survival with magic and dragons', 'Техника и космос без лагов': 'Tech and space, no lag', 'Строить красивые дома и фермы': 'Build nice houses and farms',
  'Приключения, данжи и боссы': 'Adventures, dungeons and bosses', 'Покемоны и карта': 'Pokémon and a map', 'Максимум FPS на слабом ПК': 'Max FPS on a weak PC',
  'Огненный меч, который поджигает врагов': 'A fire sword that sets enemies alight', 'Ледяная броня и замораживающий топор': 'Ice armor and a freezing axe',
  'Пицца, которая даёт скорость и силу': 'Pizza that gives speed and strength', 'Меч-молния, бьющий громом': 'A lightning sword that strikes thunder',
  'Кирка шахтёра с ночным зрением': "Miner's pickaxe with night vision", 'Радужное печенье с регенерацией': 'Rainbow cookie with regeneration',
  'Скорость': 'Speed', 'Замедление': 'Slowness', 'Спешка': 'Haste', 'Сила': 'Strength', 'Исцеление': 'Healing', 'Прыгучесть': 'Jump boost', 'Регенерация': 'Regeneration',
  'Сопротивление': 'Resistance', 'Огнестойкость': 'Fire resistance', 'Подводное дыхание': 'Water breathing', 'Невидимость': 'Invisibility', 'Ночное зрение': 'Night vision',
  'Слабость': 'Weakness', 'Отравление': 'Poison', 'Иссушение': 'Wither', 'Поглощение': 'Absorption', 'Насыщение': 'Saturation', 'Свечение': 'Glowing',
  'Левитация': 'Levitation', 'Удача': 'Luck', 'Плавное падение': 'Slow falling', 'Сила источника': 'Conduit power', 'Грация дельфина': "Dolphin's grace",
  'Герой деревни': 'Hero of the village', 'Тьма': 'Darkness', '⚡ Иногда бьёт молнией': '⚡ Sometimes strikes lightning', 'Отклонена': 'Rejected',
  // Сундуки
  'Забирайте монеты каждый день и открывайте сундуки — внутри скины и эффекты': 'Claim coins every day and open chests — skins and effects inside',
  'Коллекция': 'Collection', 'Обычный сундук': 'Common chest', 'Сундук эффектов': 'Effects chest', 'Легендарный сундук': 'Legendary chest',
  'Скины и обычные эффекты': 'Skins and common effects', 'Только спецэффекты — молния, огонь, портал…': 'Effects only — lightning, fire, portal…', 'Только редкое и выше': 'Rare and above only',
  'Открыть бесплатно': 'Open for free', 'PRO · бесплатно': 'PRO · free', 'Надеть скин': 'Wear skin', 'Надеть плащ': 'Wear cape', 'Включить эффект': 'Turn on effect',
  '· уже есть в коллекции': '· already in collection', 'эффект': 'effect', 'плащ': 'cape', 'скин': 'skin',
  // Скриншоты
  '⭐ Важные моменты': '⭐ Highlights', 'Открыть папку': 'Open folder', 'Показать в папке': 'Show in folder', '⭐ Важный момент': '⭐ Highlight', '☆ Отметить': '☆ Mark',
  'Нажмите': 'Press', 'в игре — снимок сразу попадёт сюда. Звёздочкой отмечайте важные моменты.': 'in game — the shot appears here instantly. Star your highlights.',
  'Пока нет скриншотов. Запустите игру и нажмите F2 — снимок появится здесь.': 'No screenshots yet. Launch the game and press F2 — the shot will appear here.',
  'Отметьте звёздочкой важные моменты — они соберутся здесь': 'Star your highlights — they will gather here', '📸 Скриншот сохранён в галерею': '📸 Screenshot saved to the gallery', '· мод': '· mod',
  // Серверы
  'Любимые серверы с онлайном и пингом — «Играть» сразу подключает': 'Favorite servers with players and ping — “Play” joins instantly', 'Название': 'Name',
  'Адрес: play.example.net': 'Address: play.example.net', 'Добавьте сервер по адресу выше': 'Add a server by address above',
  'Лаунчер сам выберет версию игры, которая нужна серверу. Без лицензии Minecraft зайти можно только на серверы, которые это разрешают.': 'The launcher picks the game version the server needs. Without a Minecraft license you can only join servers that allow it.',
  // Друзья и звонки
  'Откройте свой мир — друзья зайдут к вам в один клик': 'Open your world — friends join you in one click', '🌍 Играть с друзьями': '🌍 Play with friends',
  'Лаунчер подготовит игру, а вы откройте мир:': 'The launcher prepares the game, you open the world:', 'Esc → «Открыть для сети»': 'Esc → “Open to LAN”', '. Друзья увидят кнопку «Зайти».': '. Friends will see a “Join” button.',
  'Разрешить для друзей': 'Allow friends', 'Готовим игру…': 'Preparing the game…', 'Мир открыт': 'World is open', 'Добавить друга': 'Add friend', 'Ник друга': "Friend's nickname",
  'Заявки в друзья': 'Friend requests', 'Мои друзья': 'My friends', 'Хочет добавить вас в друзья': 'Wants to be your friend', 'Заявка отправлена': 'Request sent',
  'Пока нет друзей — добавьте друга по нику слева': 'No friends yet — add one by nickname on the left', '⚪ Не в сети': '⚪ Offline', '🟢 В лаунчере': '🟢 In the launcher',
  'Сообщение…': 'Message…', 'Напишите первое сообщение 👋': 'Write the first message 👋', 'Мир открыт для друзей — они увидят кнопку «Зайти»': 'World is open — friends will see a “Join” button',
  'Если у друзей нет купленного Minecraft — выключите там «Online Mode».': "If your friends don't own Minecraft, turn off “Online Mode” there.",
  'Завершить': 'Hang up', '🎤 Вкл': '🎤 On', '🔇 Выкл': '🔇 Muted', 'Соединяем…': 'Connecting…', 'Нет доступа к микрофону': 'No microphone access',
  'Связь прервалась': 'Connection lost', 'Не удалось соединиться — возможно, мешает роутер': 'Could not connect — your router may be blocking it', 'Ждём, когда друг ответит': 'Waiting for your friend to answer',
  'Голосовой звонок Rionina': 'Rionina voice call',
  // Профиль и достижения
  'Достижения': 'Achievements', 'в игре': 'played', 'сундуков открыто': 'chests opened', 'друзей': 'friends', 'скриншотов': 'screenshots', 'достижений': 'achievements',
  'Добро пожаловать': 'Welcome', 'Войти в Rionina': 'Sign in to Rionina', 'Модник': 'Fashionista', 'Надеть свой скин': 'Wear your skin', 'Втянулся': 'Hooked',
  'Наиграть 1 час': 'Play for 1 hour', 'Ветеран': 'Veteran', 'Наиграть 10 часов': 'Play for 10 hours', 'Кладоискатель': 'Treasure hunter', 'Открыть 10 сундуков': 'Open 10 chests',
  'Неделя подряд': 'Week streak', 'Забирать награду 7 дней подряд': 'Claim the reward 7 days in a row', 'Первый друг': 'First friend', 'Добавить друга ': 'Add a friend',
  'Компания': 'Squad', 'Добавить 5 друзей': 'Add 5 friends', 'На связи': 'On the line', 'Поговорить с другом голосом': 'Talk to a friend by voice',
  'Зайти на сервер из лаунчера': 'Join a server from the launcher', 'Фотограф': 'Photographer', 'Сделать скриншот (F2)': 'Take a screenshot (F2)', 'Герой в плаще': 'Caped hero',
  'Надеть плащ ': 'Wear a cape', 'Сборщик': 'Builder', 'Создать ИИ-сборку': 'Create an AI pack', 'Творец': 'Creator', 'Создать мод с нейросетью': 'Create a mod with AI',
  // Pro
  'Больше скинов, бесплатные сундуки, 50 друзей и ускорение игры.': 'More skins, free chests, 50 friends and a faster game.', '· подписка Pro': '· Pro subscription',
  'Купить за $10': 'Buy for $10', 'Оплата картой появится в ближайшем обновлении': 'Card payment arrives in an upcoming update', '✓ Pro активен': '✓ Pro is active',
  'Бесплатные сундуки': 'Free chests', 'Открывайте любые сундуки без монет.': 'Open any chest without coins.', '×2 ежедневная награда': '×2 daily reward',
  'Вдвое больше Rionina Coins каждый день.': 'Twice the Rionina Coins every day.', 'Pro-скины': 'Pro skins', 'Ещё 6 эксклюзивных скинов на выбор.': '6 more exclusive skins.',
  '50 друзей': '50 friends', 'Вместо 10 в обычной версии.': 'Instead of 10 in the free version.', 'Больше FPS': 'More FPS',
  'Sodium, Lithium, FerriteCore, ImmediatelyFast и ModernFix ставятся в сборки сами.': 'Sodium, Lithium, FerriteCore, ImmediatelyFast and ModernFix install into builds automatically.',
  'Быстрее загрузка': 'Faster loading', 'Вдвое больше потоков загрузки и настроенная Java — меньше фризов.': 'Twice the download threads and tuned Java — fewer stutters.',
  '🚀 Ускорить сборку': '🚀 Boost a build', 'Поставит моды на производительность в выбранную сборку Fabric.': 'Installs performance mods into the selected Fabric build.', 'Ускорить': 'Boost',
  'Добро пожаловать в Rionina Pro! 🎉': 'Welcome to Rionina Pro! 🎉',
  // Bedrock
  'Minecraft для Windows, телефонов и консолей': 'Minecraft for Windows, phones and consoles', '📱 Rionina на телефоне': '📱 Rionina on your phone', '🔄 Кроссплей': '🔄 Crossplay',
  'Установите Rionina Launcher на Android или iPhone — новости, серверы и запуск Minecraft Bedrock в одно касание.': 'Install Rionina Launcher on Android or iPhone — news, servers and one-tap Minecraft Bedrock.',
  'Bedrock на ПК, телефоне, Xbox, PlayStation и Switch играет на одних серверах и в одних мирах Realms.': 'Bedrock on PC, phone, Xbox, PlayStation and Switch shares the same servers and Realms.',
  'Проверяем, установлен ли Bedrock на этом компьютере…': 'Checking whether Bedrock is installed on this computer…', 'Только Windows': 'Windows only', 'Не установлено': 'Not installed',
  'Bedrock Edition установлен и обновляется автоматически через Microsoft Store.': 'Bedrock Edition is installed and updates automatically via the Microsoft Store.',
  'Нажмите «Установить» — лаунчер сам скачает и установит Bedrock. Нужен аккаунт Microsoft с купленным Minecraft.': 'Click “Install” — the launcher downloads and installs Bedrock. You need a Microsoft account that owns Minecraft.',
  'На этом компьютере Bedrock недоступен — он выходит для Windows 10/11, Android, iOS и консолей. Установите Rionina на телефон, чтобы играть в Bedrock там.': 'Bedrock is not available on this computer — it is for Windows 10/11, Android, iOS and consoles. Install Rionina on your phone to play Bedrock there.',
  'Начата установка Minecraft Bedrock': 'Minecraft Bedrock installation started', 'Не удалось установить Bedrock': 'Could not install Bedrock',
  'Скачиваем Minecraft: Bedrock Edition из Microsoft Store. Можно пока играть в Java.': 'Downloading Minecraft: Bedrock Edition from the Microsoft Store. You can play Java meanwhile.',
  'Minecraft Bedrock установлен — нажмите «Играть» во вкладке Bedrock': 'Minecraft Bedrock installed — click “Play” in the Bedrock tab',
  // Настройки
  'Аккаунты': 'Accounts', '＋ Аккаунт Microsoft': '＋ Microsoft account', '＋ Rionina ID (ник + пароль)': '＋ Rionina ID (nickname + password)', '● Активный': '● Active',
  'Войти': 'Switch', 'Аккаунт Microsoft': 'Microsoft account', 'Офлайн': 'Offline', 'Офлайн без пароля': 'Offline, no password', 'Rionina ID · локально': 'Rionina ID · local',
  '＋ Добавить аккаунт': '＋ Add account', 'Управление аккаунтами': 'Manage accounts', 'Оформление': 'Appearance', 'Режим': 'Mode', 'Светлый, тёмный или как в системе': 'Light, dark or follow the system',
  'Авто': 'Auto', 'Светлая': 'Light', 'Тёмная': 'Dark', 'Тема': 'Theme', 'Стандарт': 'Standard', 'Океан': 'Ocean', 'Закат': 'Sunset', 'Лес': 'Forest', 'Сакура': 'Sakura',
  'Неон': 'Neon', 'Космос': 'Space', 'Цвет акцента': 'Accent color', 'Фон из галереи': 'Background from gallery', 'Любая ваша картинка вместо фона лаунчера': 'Any picture of yours as the launcher background',
  'Выбрать фото': 'Choose photo', 'Убрать': 'Remove', 'Фон установлен': 'Background set', 'Игра': 'Game', 'Оперативная память': 'Memory (RAM)', 'Полноэкранный режим': 'Fullscreen',
  'Запускать игру на весь экран': 'Launch the game fullscreen', 'Скрывать лаунчер': 'Hide launcher', 'Прятать окно, пока идёт игра': 'Hide the window while playing',
  'Автоустановка Bedrock': 'Auto-install Bedrock', 'Устанавливать Minecraft Bedrock при первом запуске (Windows)': 'Install Minecraft Bedrock on first launch (Windows)',
  'Папка игры': 'Game folder', 'Сервер Rionina': 'Rionina server', 'Адрес сервера': 'Server address', 'Аккаунты, друзья и монеты': 'Accounts, friends and coins',
  'Адрес сервера сохранён': 'Server address saved', '🟢 Подключено — аккаунты, друзья и монеты': '🟢 Connected — accounts, friends and coins',
  '⚪ Сервер недоступен — работает локальный режим': '⚪ Server unavailable — local mode', 'Журнал игры': 'Game log', 'Игра ещё не запускалась.': 'The game has not been launched yet.',
  '· Java устанавливается автоматически · Не связан с Mojang или Microsoft': '· Java installs automatically · Not affiliated with Mojang or Microsoft',
  // Обновления
  'Обновите Rionina Launcher до новой версии': 'Update Rionina Launcher to the new version', 'Обновить': 'Update', 'Скачивание…': 'Downloading…', 'Перезапустить': 'Restart',
  'Язык': 'Language', 'Русский и English': 'Russian and English',
  'Обновите Rionina Launcher': 'Update Rionina Launcher', 'Что добавили': "What's new", 'Обновить сейчас': 'Update now',
  '⚠️ Это обязательное обновление — без него играть нельзя.': '⚠️ This update is required — you cannot play without it.', 'Сначала обновите': 'Update first',
};

// Фразы с числами и именами
const EN_PATTERNS = [
  [/^Обновите Rionina Launcher до версии (.+)$/, 'Update Rionina Launcher to version $1'],
  [/^Новая версия (.+)$/, 'New version $1'],
  [/^Версия (.+) готова — перезапустите лаунчер$/, 'Version $1 is ready — restart the launcher'],
  [/^Minecraft (.+) \(будет установлена\)$/, 'Minecraft $1 (will be installed)'],
  [/^Уровень (\d+)$/, 'Level $1'], [/^ещё (\d+) опыта до (\d+)$/, '$1 more XP to level $2'],
  [/^Друзей: (\d+) из (\d+)( · с Pro до 50)?$/, (m, a, b, c) => `Friends: ${a} of ${b}${c ? ' · up to 50 with Pro' : ''}`],
  [/^Открыть за (\d+)$/, 'Open for $1'], [/^День (\d+)$/, 'Day $1'], [/^Забрать (\d+)$/, 'Claim $1'], [/^Завтра ещё$/, 'More tomorrow'],
  [/^Ежедневная награда$/, 'Daily reward'], [/^Заходите каждый день подряд — награда растёт( · Pro ×2)?$/, (m, p) => `Come back every day in a row — the reward grows${p ? ' · Pro ×2' : ''}`],
  [/^\+(\d+) Rionina Coins!$/, '+$1 Rionina Coins!'], [/^💰 \+(\d+) монет (.+)$/, '💰 +$1 coins'],
  [/^🏆 Достижение «(.+)» · \+(\d+) монет$/, (m, n, c) => `🏆 Achievement “${EN[n] || n}” · +${c} coins`],
  [/^(\d+) из (\d+) · за 30 минут игры \+10 монет$/, '$1 of $2 · +10 coins per 30 minutes played'],
  [/^(\d+) ч (\d+) мин$/, '$1 h $2 min'], [/^(\d+) мин$/, '$1 min'], [/^(\d+) мс$/, '$1 ms'],
  [/^Звоним (.+)…$/, 'Calling $1…'], [/^📞 (.+) звонит вам$/, '📞 $1 is calling you'], [/^(.+) не отвечает$/, '$1 is not answering'],
  [/^(.+) завершил звонок$/, '$1 ended the call'], [/^(.+) отклонил звонок$/, '$1 declined the call'], [/^(.+) сейчас разговаривает$/, '$1 is on another call'],
  [/^(\d\d:\d\d) · можно играть — звонок идёт в фоне$/, '$1 · you can play — the call continues in the background'],
  [/^Вы вошли как (.+)$/, 'Signed in as $1'], [/^Добавлен аккаунт (.+)$/, 'Account $1 added'], [/^Заявка отправлена игроку (.+)$/, 'Request sent to $1'],
  [/^Теперь вы друзья с (.+)!$/, 'You are now friends with $1!'], [/^💬 (.+)$/, '💬 $1'],
  [/^Создать сборку \((\d+) модов\)$/, 'Create build ($1 mods)'], [/^(\d+) модов · автор (.+)$/, '$1 mods · by $2'],
  [/^Сборка на (.+): (.+)\.$/, 'Build on $1: $2.'], [/^Minecraft (\d[\w.-]*)$/, 'Minecraft $1'],
  [/^🔒 Ещё (\d+) — в сундуках$/, '🔒 $1 more — in chests'], [/^Версия (.+) · Windows ~(\d+) МБ$/, 'Version $1 · Windows ~$2 MB'],
  [/^Установлено · (.+)$/, 'Installed · $1'], [/^Установка · (\d+)%$/, 'Installing · $1%'], [/^Установлено (\d+)$/, 'Installed $1'],
  [/^Всего на компьютере: (\d+) ГБ\. Рекомендуем 4–6 ГБ$/, 'Total on this computer: $1 GB. We recommend 4–6 GB'], [/^([\d.]+) ГБ$/, '$1 GB'],
  [/^Нейросеть подключена · $/, 'AI connected · '],
];

function tr(text) {
  const t = text.trim();
  if (!t || !/[а-яё]/i.test(t)) return null;
  let out = EN[t];
  if (out == null) {
    for (const [re, rep] of EN_PATTERNS) if (re.test(t)) { out = t.replace(re, rep); break; }
  }
  return out == null ? null : text.replace(t, out);
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    const r = tr(root.nodeValue);
    if (r != null) root.nodeValue = r;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
  for (const attr of ['placeholder', 'title']) {
    const v = root.getAttribute?.(attr);
    if (v) { const r = tr(v); if (r != null) root.setAttribute(attr, r); }
  }
  // Значения кнопок в выпадающих списках
  if (root.tagName === 'OPTION') { const r = tr(root.textContent); if (r != null) root.textContent = r; return; }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = walker.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) { const r = tr(n.nodeValue); if (r != null) n.nodeValue = r; }
    else {
      for (const attr of ['placeholder', 'title']) {
        const v = n.getAttribute(attr);
        if (v) { const r = tr(v); if (r != null) n.setAttribute(attr, r); }
      }
    }
    n = walker.nextNode();
  }
}

if (LANG === 'en') {
  document.documentElement.lang = 'en';
  translateTree(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') translateTree(m.target);
      else if (m.type === 'attributes') translateTree(m.target);
      else m.addedNodes.forEach(translateTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
}

// Переключатель языка в настройках
{
  const row = document.createElement('div');
  row.className = 'group-row';
  row.innerHTML = `<div><strong>Язык · Language</strong><span class="muted small">Русский и English</span></div>
    <div class="segmented" id="langSeg"><button data-v="ru">Русский</button><button data-v="en">English</button></div>`;
  const group = document.getElementById('modeSeg').closest('.group');
  group.insertBefore(row, group.firstChild);
  row.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.v === LANG);
    b.addEventListener('click', () => {
      if (b.dataset.v === LANG) return;
      try { localStorage.setItem('rionina-lang', b.dataset.v); } catch { /* нет хранилища */ }
      location.reload();
    });
  });
}
