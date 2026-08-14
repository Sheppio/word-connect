/* Word Connect — category pool.

   Each set lists as many members as fit comfortably on a card; a puzzle takes
   four of them at random, so the same category plays differently each time.

   Words that genuinely belong to two categories (ORANGE, PYTHON, TURKEY,
   JAGUAR…) are deliberately listed in BOTH. buildPuzzle() only ever deals a
   word that is unique among the six categories on the board, so listing the
   overlap is what stops an ambiguous card reaching the player.

   That guard works on identical words. Where two categories overlap in meaning
   without sharing a word — every snake is also a reptile — name the other in
   `conflicts` and the two will never be dealt onto the same board.

   Keep words to about ten characters — four cards share the width of a phone.
   Two short words with a space between them wrap and are fine. */

const CATEGORIES = [
  { title: 'Days of the Week', words: [
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] },

  { title: 'Months of the Year', words: [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST',
    'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'] },

  { title: 'Countries', words: [
    'BRAZIL', 'JAPAN', 'EGYPT', 'CANADA', 'MEXICO', 'KENYA', 'NORWAY', 'PERU',
    'CHILE', 'INDIA', 'SPAIN', 'GREECE', 'TURKEY', 'CHINA', 'FRANCE', 'ITALY',
    'POLAND', 'VIETNAM', 'CUBA', 'NEPAL', 'SWEDEN', 'MOROCCO', 'GEORGIA',
    'ICELAND', 'THAILAND', 'PORTUGAL'] },

  { title: 'Capital Cities', words: [
    'PARIS', 'TOKYO', 'CAIRO', 'LIMA', 'MADRID', 'ATHENS', 'OSLO', 'DUBLIN',
    'LISBON', 'VIENNA', 'BERLIN', 'ROME', 'PRAGUE', 'HAVANA', 'NAIROBI',
    'SEOUL', 'HELSINKI', 'BUDAPEST', 'WARSAW', 'BANGKOK', 'OTTAWA', 'CANBERRA'] },

  { title: 'US States', words: [
    'TEXAS', 'ALASKA', 'NEVADA', 'OHIO', 'FLORIDA', 'UTAH', 'OREGON', 'HAWAII',
    'IDAHO', 'KANSAS', 'MAINE', 'ARIZONA', 'GEORGIA', 'VERMONT', 'MONTANA',
    'ALABAMA', 'INDIANA', 'WYOMING'] },

  { title: 'Oceans & Seas', words: [
    'PACIFIC', 'ARCTIC', 'BALTIC', 'CORAL', 'ATLANTIC', 'CASPIAN', 'AEGEAN',
    'ADRIATIC', 'ARABIAN', 'TASMAN', 'IONIAN', 'BERING'] },

  { title: 'Farm Animals', words: [
    'COW', 'SHEEP', 'GOAT', 'PIG', 'HORSE', 'DUCK', 'CHICKEN', 'DONKEY',
    'GOOSE', 'TURKEY', 'LLAMA', 'ALPACA', 'CALF', 'LAMB', 'PONY'] },

  { title: 'Big Cats', words: [
    'LION', 'TIGER', 'LEOPARD', 'CHEETAH', 'JAGUAR', 'PUMA', 'COUGAR', 'LYNX',
    'OCELOT', 'PANTHER', 'CARACAL', 'SERVAL'] },

  { title: 'Dogs', words: [
    'LABRADOR', 'HUSKY', 'PUG', 'CORGI', 'BEAGLE', 'POODLE', 'BOXER', 'TERRIER',
    'DALMATIAN', 'SPANIEL', 'COLLIE', 'BULLDOG', 'CHIHUAHUA', 'GREYHOUND',
    'DACHSHUND', 'SETTER'] },

  { title: 'Birds', words: [
    'EAGLE', 'FINCH', 'PENGUIN', 'OWL', 'ROBIN', 'SPARROW', 'FALCON', 'PARROT',
    'PELICAN', 'TOUCAN', 'HERON', 'RAVEN', 'MAGPIE', 'SWALLOW', 'TURKEY',
    'SWIFT', 'STORK', 'KESTREL', 'PUFFIN', 'WREN'] },

  { title: 'Sea Creatures', words: [
    'DOLPHIN', 'OCTOPUS', 'SHARK', 'CRAB', 'WHALE', 'SEAL', 'LOBSTER',
    'JELLYFISH', 'STINGRAY', 'SQUID', 'SEAHORSE', 'TURTLE', 'WALRUS',
    'STARFISH', 'PRAWN', 'EEL'] },

  { title: 'Insects', words: [
    'BEETLE', 'WASP', 'MOTH', 'ANT', 'BEE', 'LOCUST', 'CRICKET', 'DRAGONFLY',
    'TERMITE', 'APHID', 'MANTIS', 'HORNET', 'LADYBIRD', 'WEEVIL', 'EARWIG'] },

  { title: 'Reptiles', words: [
    'GECKO', 'TURTLE', 'IGUANA', 'CROCODILE', 'ALLIGATOR', 'CHAMELEON',
    'TORTOISE', 'LIZARD', 'SKINK', 'TERRAPIN', 'SNAKE', 'MONITOR', 'CAIMAN',
    'TUATARA'],
    conflicts: ['Snakes'] },

  { title: 'Snakes', words: [
    'COBRA', 'PYTHON', 'VIPER', 'ADDER', 'MAMBA', 'BOA', 'RATTLER',
    'ANACONDA', 'TAIPAN', 'KRAIT', 'ASP'] },

  { title: 'Vehicles', words: [
    'TRUCK', 'TRACTOR', 'SCOOTER', 'VAN', 'BUS', 'TAXI', 'LORRY', 'TRAM',
    'MOPED', 'CARAVAN', 'JEEP', 'PICKUP', 'AMBULANCE', 'MINIBUS', 'COACH',
    'FORKLIFT'] },

  { title: 'Boats', words: [
    'CANOE', 'KAYAK', 'FERRY', 'YACHT', 'DINGHY', 'BARGE', 'TRAWLER', 'TUG',
    'GONDOLA', 'SCHOONER', 'CATAMARAN', 'RAFT', 'PUNT', 'GALLEON', 'SAMPAN'] },

  { title: 'Aircraft', words: [
    'JET', 'GLIDER', 'BALLOON', 'CHOPPER', 'AIRSHIP', 'BIPLANE', 'ZEPPELIN',
    'SEAPLANE', 'JUMBO', 'ROCKET', 'DRONE', 'MICROLIGHT'] },

  { title: 'Shapes', words: [
    'CIRCLE', 'SQUARE', 'HEXAGON', 'OVAL', 'TRIANGLE', 'PENTAGON', 'OCTAGON',
    'DIAMOND', 'RHOMBUS', 'CUBE', 'SPHERE', 'CONE', 'PRISM', 'CRESCENT',
    'CYLINDER', 'PYRAMID'] },

  { title: 'Star Signs', words: [
    'LIBRA', 'ARIES', 'VIRGO', 'GEMINI', 'TAURUS', 'CANCER', 'LEO', 'SCORPIO',
    'PISCES', 'CAPRICORN', 'AQUARIUS'] },

  { title: 'Planets', words: [
    'MARS', 'VENUS', 'SATURN', 'NEPTUNE', 'JUPITER', 'MERCURY', 'EARTH',
    'URANUS', 'PLUTO'] },

  { title: 'In the Night Sky', words: [
    'COMET', 'NEBULA', 'ECLIPSE', 'METEOR', 'GALAXY', 'ASTEROID', 'AURORA',
    'MOON', 'SUPERNOVA', 'QUASAR', 'ORBIT', 'CRATER', 'PULSAR'] },

  { title: 'Colours', words: [
    'CRIMSON', 'INDIGO', 'AMBER', 'TEAL', 'SCARLET', 'MAROON', 'TURQUOISE',
    'MAGENTA', 'OLIVE', 'LILAC', 'BEIGE', 'VIOLET', 'ORANGE', 'CORAL',
    'LAVENDER', 'GREEN', 'IVORY', 'MUSTARD'] },

  { title: 'Fruits', words: [
    'BANANA', 'MANGO', 'CHERRY', 'PEACH', 'ORANGE', 'GRAPE', 'LEMON', 'MELON',
    'PAPAYA', 'APRICOT', 'PLUM', 'PEAR', 'KIWI', 'LIME', 'FIG', 'GUAVA',
    'LYCHEE', 'APPLE'] },

  { title: 'Vegetables', words: [
    'CARROT', 'ONION', 'SPINACH', 'LEEK', 'POTATO', 'CABBAGE', 'BROCCOLI',
    'CELERY', 'PARSNIP', 'TURNIP', 'PUMPKIN', 'COURGETTE', 'RADISH',
    'PEPPER', 'SPROUT', 'BEETROOT'] },

  { title: 'Nuts', words: [
    'ALMOND', 'CASHEW', 'WALNUT', 'PECAN', 'PISTACHIO', 'HAZELNUT', 'PEANUT',
    'MACADAMIA', 'CHESTNUT', 'BRAZIL'] },

  { title: 'Herbs & Spices', words: [
    'BASIL', 'THYME', 'CUMIN', 'SAGE', 'OREGANO', 'PAPRIKA', 'GINGER',
    'NUTMEG', 'CINNAMON', 'PARSLEY', 'ROSEMARY', 'CHIVES', 'SAFFRON', 'PEPPER',
    'CLOVES', 'MINT', 'DILL', 'TURMERIC'] },

  { title: 'Breakfast', words: [
    'CEREAL', 'TOAST', 'BACON', 'WAFFLE', 'PANCAKE', 'OMELETTE', 'PORRIDGE',
    'CROISSANT', 'MUESLI', 'GRANOLA', 'SAUSAGE', 'YOGHURT', 'CRUMPET'] },

  { title: 'Fast Food', words: [
    'BURGER', 'FRIES', 'NUGGETS', 'TACO', 'PIZZA', 'HOT DOG', 'KEBAB',
    'BURRITO', 'NACHOS', 'WRAP', 'CHIPS', 'MILKSHAKE'] },

  { title: 'Desserts', words: [
    'SUNDAE', 'BROWNIE', 'TRIFLE', 'ECLAIR', 'PAVLOVA', 'TIRAMISU', 'MOUSSE',
    'CHEESECAKE', 'CUSTARD', 'PUDDING', 'SORBET', 'GELATO', 'CRUMBLE',
    'DOUGHNUT', 'PARFAIT'] },

  { title: 'Drinks', words: [
    'COFFEE', 'JUICE', 'SODA', 'TEA', 'LEMONADE', 'MILKSHAKE',
    'CIDER', 'SMOOTHIE', 'ESPRESSO', 'LATTE', 'COLA', 'WATER', 'SQUASH'] },

  { title: 'Cheeses', words: [
    'CHEDDAR', 'BRIE', 'FETA', 'GOUDA', 'STILTON', 'MOZZARELLA', 'PARMESAN',
    'EDAM', 'RICOTTA', 'HALLOUMI', 'CAMEMBERT', 'ROQUEFORT', 'MANCHEGO',
    'GRUYERE'] },

  { title: 'Pasta', words: [
    'PENNE', 'FUSILLI', 'RAVIOLI', 'LASAGNE', 'SPAGHETTI', 'MACARONI',
    'LINGUINE', 'RIGATONI', 'GNOCCHI', 'FARFALLE', 'ORZO', 'TORTELLINI'] },

  { title: 'Boxing', words: [
    'PUNCH', 'UPPERCUT', 'HOOK', 'JAB', 'CROSS', 'CLINCH', 'KNOCKOUT',
    'SPARRING', 'RINGSIDE', 'GLOVES', 'ROUND', 'BOUT', 'SOUTHPAW', 'REFEREE'] },

  { title: 'Team Sports', words: [
    'SOCCER', 'RUGBY', 'HOCKEY', 'CRICKET', 'BASEBALL', 'NETBALL', 'HANDBALL',
    'VOLLEYBALL', 'LACROSSE', 'POLO', 'FOOTBALL', 'BASKETBALL', 'CURLING'] },

  { title: 'Athletics', words: [
    'JAVELIN', 'HURDLES', 'DISCUS', 'RELAY', 'SPRINT', 'MARATHON', 'SHOT PUT',
    'LONG JUMP', 'HIGH JUMP', 'POLE VAULT', 'DECATHLON', 'WALK'] },

  { title: 'Tennis', words: [
    'SERVE', 'VOLLEY', 'DEUCE', 'LOB', 'ACE', 'RALLY', 'SMASH', 'BASELINE',
    'FOREHAND', 'BACKHAND', 'LET', 'NET', 'TIEBREAK', 'SLICE'] },

  { title: 'Golf', words: [
    'BIRDIE', 'BUNKER', 'PUTTER', 'CADDIE', 'EAGLE', 'FAIRWAY', 'GREEN', 'TEE',
    'ALBATROSS', 'BOGEY', 'WEDGE', 'DRIVER', 'IRON', 'ROUGH'] },

  { title: 'Chess Pieces', words: [
    'KING', 'ROOK', 'BISHOP', 'PAWN', 'QUEEN', 'KNIGHT'] },

  { title: 'Card Games', words: [
    'POKER', 'RUMMY', 'BRIDGE', 'CANASTA', 'SOLITAIRE', 'BLACKJACK', 'WHIST',
    'CRIBBAGE', 'PATIENCE', 'PONTOON', 'SNAP', 'UNO', 'HEARTS'] },

  { title: 'Retro Games', words: [
    'TETRIS', 'PACMAN', 'ASTEROID', 'MARIO', 'PONG', 'FROGGER', 'GALAGA',
    'SONIC', 'ZELDA', 'CENTIPEDE', 'DEFENDER', 'QBERT', 'TRON'] },

  { title: 'Instruments', words: [
    'VIOLIN', 'TRUMPET', 'PIANO', 'HARP', 'FLUTE', 'CELLO', 'GUITAR', 'DRUMS',
    'OBOE', 'CLARINET', 'BANJO', 'TUBA', 'ACCORDION', 'UKULELE', 'BASSOON',
    'ORGAN'] },

  { title: 'Music Genres', words: [
    'JAZZ', 'REGGAE', 'TECHNO', 'BLUES', 'ROCK', 'POP', 'FOLK', 'GRUNGE',
    'DISCO', 'SOUL', 'GOSPEL', 'PUNK', 'OPERA', 'SKA', 'GARAGE', 'SWING'] },

  { title: 'Dances', words: [
    'TANGO', 'SALSA', 'WALTZ', 'SAMBA', 'RUMBA', 'FOXTROT', 'JIVE', 'MAMBO',
    'BOLERO', 'CONGA', 'TWIST', 'BALLET', 'FLAMENCO', 'CHARLESTON'] },

  { title: 'Film Genres', words: [
    'HORROR', 'COMEDY', 'WESTERN', 'THRILLER', 'ROMANCE', 'FANTASY', 'MUSICAL',
    'ANIMATION', 'MYSTERY', 'DRAMA', 'ACTION', 'NOIR', 'SCIFI', 'EPIC'] },

  { title: 'Luxury Cars', words: [
    'AUDI', 'BMW', 'MERCEDES', 'FERRARI', 'PORSCHE', 'BENTLEY', 'JAGUAR',
    'MASERATI', 'LEXUS', 'TESLA', 'BUGATTI', 'LOTUS'] },

  { title: 'Weather', words: [
    'DRIZZLE', 'THUNDER', 'BLIZZARD', 'FOG', 'HAIL', 'SLEET', 'LIGHTNING',
    'BREEZE', 'SHOWER', 'GALE', 'FROST', 'MIST', 'TORNADO', 'MONSOON',
    'DOWNPOUR', 'HEATWAVE'] },

  { title: 'Landforms', words: [
    'CANYON', 'PLATEAU', 'VALLEY', 'DUNE', 'CLIFF', 'MESA', 'FJORD', 'GORGE',
    'RIDGE', 'CRATER', 'DELTA', 'ISTHMUS', 'GLACIER', 'PLAIN', 'SUMMIT'] },

  { title: 'Trees', words: [
    'OAK', 'WILLOW', 'BIRCH', 'MAPLE', 'PINE', 'CEDAR', 'ASH', 'ELM', 'BEECH',
    'SPRUCE', 'POPLAR', 'SYCAMORE', 'ASPEN', 'REDWOOD', 'HAWTHORN', 'ROWAN'] },

  { title: 'Flowers', words: [
    'TULIP', 'DAISY', 'ORCHID', 'LILY', 'ROSE', 'POPPY', 'IRIS', 'PEONY',
    'DAHLIA', 'VIOLET', 'FUCHSIA', 'JASMINE', 'LAVENDER', 'MARIGOLD',
    'BLUEBELL', 'CROCUS'] },

  { title: 'Gemstones', words: [
    'RUBY', 'OPAL', 'JADE', 'TOPAZ', 'EMERALD', 'SAPPHIRE', 'DIAMOND',
    'AMETHYST', 'GARNET', 'PEARL', 'AMBER', 'ONYX', 'QUARTZ', 'TURQUOISE',
    'ZIRCON'] },

  { title: 'Metals', words: [
    'COPPER', 'NICKEL', 'ZINC', 'BRONZE', 'IRON', 'STEEL', 'SILVER', 'GOLD',
    'BRASS', 'TIN', 'LEAD', 'PEWTER', 'TITANIUM', 'MERCURY', 'ALUMINIUM',
    'PLATINUM'] },

  { title: 'Tools', words: [
    'HAMMER', 'CHISEL', 'WRENCH', 'PLIERS', 'SAW', 'DRILL', 'SPANNER',
    'MALLET', 'CROWBAR', 'CLAMP', 'SANDER', 'AXE', 'FILE', 'LEVEL', 'RASP'] },

  { title: 'Kitchen Kit', words: [
    'WHISK', 'LADLE', 'GRATER', 'SIEVE', 'SPATULA', 'COLANDER', 'PEELER',
    'TONGS', 'KETTLE', 'BLENDER', 'TOASTER', 'SKILLET', 'MASHER', 'TIMER'] },

  { title: 'Furniture', words: [
    'SOFA', 'DRESSER', 'STOOL', 'WARDROBE', 'TABLE', 'CHAIR', 'BOOKCASE',
    'CABINET', 'BENCH', 'DESK', 'COUCH', 'OTTOMAN', 'SIDEBOARD', 'BUNK'] },

  { title: 'Clothing', words: [
    'BLAZER', 'SCARF', 'HOODIE', 'JEANS', 'SHIRT', 'SWEATER', 'JACKET',
    'SKIRT', 'TROUSERS', 'CARDIGAN', 'DRESS', 'SHORTS', 'COAT', 'VEST',
    'BLOUSE', 'PONCHO'] },

  { title: 'Footwear', words: [
    'SANDAL', 'LOAFER', 'BOOT', 'SNEAKER', 'SLIPPER', 'BROGUE', 'STILETTO',
    'CLOG', 'TRAINER', 'PUMP', 'WELLINGTON', 'MOCCASIN', 'FLIP FLOP'] },

  { title: 'Body Parts', words: [
    'ELBOW', 'ANKLE', 'SHOULDER', 'WRIST', 'KNEE', 'THUMB', 'SPINE', 'HEEL',
    'RIBCAGE', 'JAW', 'SHIN', 'HIP', 'FOREHEAD', 'KNUCKLE', 'COLLARBONE'] },

  { title: 'Jobs', words: [
    'PLUMBER', 'DENTIST', 'BAKER', 'PILOT', 'NURSE', 'TEACHER', 'FARMER',
    'CHEF', 'LAWYER', 'BUTCHER', 'SURGEON', 'TAILOR', 'JOINER', 'VET',
    'LIBRARIAN'] },

  { title: 'School Subjects', words: [
    'BIOLOGY', 'HISTORY', 'ALGEBRA', 'PHYSICS', 'CHEMISTRY', 'GEOGRAPHY',
    'ENGLISH', 'FRENCH', 'MUSIC', 'DRAMA', 'ART', 'GEOMETRY', 'LATIN'] },

  { title: 'Emotions', words: [
    'JOY', 'ANGER', 'PRIDE', 'FEAR', 'SADNESS', 'ENVY', 'GUILT', 'SHAME',
    'HOPE', 'DISGUST', 'RELIEF', 'LOVE', 'SURPRISE', 'REGRET'] },

  { title: 'Holidays', words: [
    'EASTER', 'HALLOWEEN', 'NEW YEAR', 'DIWALI', 'CHRISTMAS', 'HANUKKAH',
    'PASSOVER', 'RAMADAN', 'EID', 'CARNIVAL', 'SOLSTICE'] },

  { title: 'Mythical Beasts', words: [
    'DRAGON', 'GRIFFIN', 'PHOENIX', 'KRAKEN', 'UNICORN', 'CENTAUR', 'MINOTAUR',
    'MERMAID', 'CYCLOPS', 'SPHINX', 'HYDRA', 'TROLL', 'GOBLIN', 'YETI', 'OGRE'] },

  { title: 'Greek Gods', words: [
    'ZEUS', 'HERA', 'APOLLO', 'HADES', 'ATHENA', 'ARES', 'POSEIDON', 'HERMES',
    'ARTEMIS', 'DEMETER', 'APHRODITE', 'HEPHAESTUS', 'DIONYSUS', 'HESTIA'] },

  { title: 'Superheroes', words: [
    'BATMAN', 'THOR', 'HULK', 'FLASH', 'SUPERMAN', 'IRON MAN', 'SPIDERMAN',
    'WOLVERINE', 'CYCLOPS', 'AQUAMAN', 'GROOT', 'STORM'] },

  { title: 'Coding Languages', words: [
    'PYTHON', 'JAVA', 'RUBY', 'SWIFT', 'RUST', 'GO', 'KOTLIN', 'PERL', 'SCALA',
    'HASKELL', 'BASIC', 'COBOL', 'PASCAL', 'LUA', 'ELIXIR'] },

  { title: 'Board Games', words: [
    'CLUEDO', 'RISK', 'MONOPOLY', 'JENGA', 'SCRABBLE', 'CHESS', 'DRAUGHTS',
    'BACKGAMMON', 'LUDO', 'DOMINOES', 'TWISTER', 'OPERATION', 'GO'] },

  { title: 'Camping Gear', words: [
    'TENT', 'LANTERN', 'COMPASS', 'STOVE', 'TORCH', 'ROPE', 'MATCHES',
    'CANTEEN', 'BACKPACK', 'HAMMOCK', 'MALLET', 'FLASK', 'PEGS'] },

  { title: 'Bathroom', words: [
    'TOWEL', 'MIRROR', 'RAZOR', 'SPONGE', 'SOAP', 'SHAMPOO', 'TOOTHBRUSH',
    'FLANNEL', 'BATHTUB', 'SHOWER', 'TOILET', 'SINK', 'COMB', 'LOOFAH'] },

  { title: 'Currencies', words: [
    'DOLLAR', 'POUND', 'EURO', 'YEN', 'RUPEE', 'PESO', 'FRANC', 'WON', 'RAND',
    'DINAR', 'SHEKEL', 'KRONA', 'LIRA', 'DIRHAM'] },

  { title: 'Languages', words: [
    'FRENCH', 'GERMAN', 'ARABIC', 'HINDI', 'SPANISH', 'ITALIAN', 'RUSSIAN',
    'JAPANESE', 'MANDARIN', 'KOREAN', 'DUTCH', 'SWEDISH', 'POLISH', 'GREEK',
    'LATIN', 'URDU'] },

  { title: 'Circus', words: [
    'CLOWN', 'TRAPEZE', 'JUGGLER', 'BIG TOP', 'ACROBAT', 'UNICYCLE',
    'RINGMASTER', 'STILTS', 'TIGHTROPE', 'CANNON', 'TAMER', 'TRICKS'] }
];
