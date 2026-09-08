// languages.mjs — die Sprachen der Welt nach ISO 639-1 (zwei Buchstaben), dazu
// Schweizerdeutsch (gsw, ISO 639-3). Je Eintrag: Code, englischer Name, Eigenname.
// Der Dienst prüft Profilsprachen gegen diese Codes; assets/languages.js wird
// aus dieser Datei erzeugt (node api/languages.mjs > assets/languages.js).
export const LANGUAGES = [
["aa","Afar","Afaraf"],["ab","Abkhazian","Аҧсуа"],["ae","Avestan","avesta"],["af","Afrikaans","Afrikaans"],["ak","Akan","Akan"],
["am","Amharic","አማርኛ"],["an","Aragonese","aragonés"],["ar","Arabic","العربية"],["as","Assamese","অসমীয়া"],["av","Avaric","авар мацӀ"],
["ay","Aymara","aymar aru"],["az","Azerbaijani","azərbaycan dili"],["ba","Bashkir","башҡорт теле"],["be","Belarusian","беларуская мова"],
["bg","Bulgarian","български език"],["bi","Bislama","Bislama"],["bm","Bambara","bamanankan"],["bn","Bengali","বাংলা"],["bo","Tibetan","བོད་ཡིག"],
["br","Breton","brezhoneg"],["bs","Bosnian","bosanski jezik"],["ca","Catalan","català"],["ce","Chechen","нохчийн мотт"],["ch","Chamorro","Chamoru"],
["co","Corsican","corsu"],["cr","Cree","ᓀᐦᐃᔭᐍᐏᐣ"],["cs","Czech","čeština"],["cu","Church Slavic","словѣньскъ"],["cv","Chuvash","чӑваш чӗлхи"],
["cy","Welsh","Cymraeg"],["da","Danish","dansk"],["de","German","Deutsch"],["dv","Divehi","ދިވެހި"],["dz","Dzongkha","རྫོང་ཁ"],["ee","Ewe","Eʋegbe"],
["el","Greek","Ελληνικά"],["en","English","English"],["eo","Esperanto","Esperanto"],["es","Spanish","Español"],["et","Estonian","eesti"],
["eu","Basque","euskara"],["fa","Persian","فارسی"],["ff","Fulah","Fulfulde"],["fi","Finnish","suomi"],["fj","Fijian","vosa Vakaviti"],
["fo","Faroese","føroyskt"],["fr","French","Français"],["fy","Western Frisian","Frysk"],["ga","Irish","Gaeilge"],["gd","Scottish Gaelic","Gàidhlig"],
["gl","Galician","galego"],["gn","Guarani","Avañe'ẽ"],["gsw","Swiss German","Schwiizerdütsch"],["gu","Gujarati","ગુજરાતી"],["gv","Manx","Gaelg"],
["ha","Hausa","Hausa"],["he","Hebrew","עברית"],["hi","Hindi","हिन्दी"],["ho","Hiri Motu","Hiri Motu"],["hr","Croatian","hrvatski"],
["ht","Haitian Creole","Kreyòl ayisyen"],["hu","Hungarian","magyar"],["hy","Armenian","Հայերեն"],["hz","Herero","Otjiherero"],["ia","Interlingua","Interlingua"],
["id","Indonesian","Bahasa Indonesia"],["ie","Interlingue","Interlingue"],["ig","Igbo","Asụsụ Igbo"],["ii","Sichuan Yi","ꆈꌠ꒿"],["ik","Inupiaq","Iñupiaq"],
["io","Ido","Ido"],["is","Icelandic","Íslenska"],["it","Italian","Italiano"],["iu","Inuktitut","ᐃᓄᒃᑎᑐᑦ"],["ja","Japanese","日本語"],
["jv","Javanese","basa Jawa"],["ka","Georgian","ქართული"],["kg","Kongo","Kikongo"],["ki","Kikuyu","Gĩkũyũ"],["kj","Kuanyama","Kuanyama"],
["kk","Kazakh","қазақ тілі"],["kl","Greenlandic","kalaallisut"],["km","Khmer","ខ្មែរ"],["kn","Kannada","ಕನ್ನಡ"],["ko","Korean","한국어"],
["kr","Kanuri","Kanuri"],["ks","Kashmiri","कश्मीरी"],["ku","Kurdish","Kurdî"],["kv","Komi","коми кыв"],["kw","Cornish","Kernewek"],
["ky","Kyrgyz","Кыргызча"],["la","Latin","latine"],["lb","Luxembourgish","Lëtzebuergesch"],["lg","Ganda","Luganda"],["li","Limburgish","Limburgs"],
["ln","Lingala","Lingála"],["lo","Lao","ພາສາລາວ"],["lt","Lithuanian","lietuvių kalba"],["lu","Luba-Katanga","Tshiluba"],["lv","Latvian","latviešu valoda"],
["mg","Malagasy","fiteny malagasy"],["mh","Marshallese","Kajin M̧ajeļ"],["mi","Maori","te reo Māori"],["mk","Macedonian","македонски јазик"],["ml","Malayalam","മലയാളം"],
["mn","Mongolian","Монгол хэл"],["mr","Marathi","मराठी"],["ms","Malay","Bahasa Melayu"],["mt","Maltese","Malti"],["my","Burmese","ဗမာစာ"],
["na","Nauru","Dorerin Naoero"],["nb","Norwegian Bokmål","Norsk bokmål"],["nd","North Ndebele","isiNdebele"],["ne","Nepali","नेपाली"],["ng","Ndonga","Owambo"],
["nl","Dutch","Nederlands"],["nn","Norwegian Nynorsk","Norsk nynorsk"],["no","Norwegian","Norsk"],["nr","South Ndebele","isiNdebele"],["nv","Navajo","Diné bizaad"],
["ny","Chichewa","chiCheŵa"],["oc","Occitan","occitan"],["oj","Ojibwe","ᐊᓂᔑᓈᐯᒧᐎᓐ"],["om","Oromo","Afaan Oromoo"],["or","Odia","ଓଡ଼ିଆ"],
["os","Ossetian","ирон æвзаг"],["pa","Punjabi","ਪੰਜਾਬੀ"],["pi","Pali","पाऴि"],["pl","Polish","polski"],["ps","Pashto","پښتو"],
["pt","Portuguese","Português"],["qu","Quechua","Runa Simi"],["rm","Romansh","rumantsch grischun"],["rn","Kirundi","Ikirundi"],["ro","Romanian","Română"],
["ru","Russian","русский"],["rw","Kinyarwanda","Ikinyarwanda"],["sa","Sanskrit","संस्कृतम्"],["sc","Sardinian","sardu"],["sd","Sindhi","सिन्धी"],
["se","Northern Sami","Davvisámegiella"],["sg","Sango","yângâ tî sängö"],["si","Sinhala","සිංහල"],["sk","Slovak","slovenčina"],["sl","Slovenian","slovenščina"],
["sm","Samoan","gagana fa'a Samoa"],["sn","Shona","chiShona"],["so","Somali","Soomaaliga"],["sq","Albanian","Shqip"],["sr","Serbian","српски језик"],
["ss","Swati","SiSwati"],["st","Southern Sotho","Sesotho"],["su","Sundanese","Basa Sunda"],["sv","Swedish","Svenska"],["sw","Swahili","Kiswahili"],
["ta","Tamil","தமிழ்"],["te","Telugu","తెలుగు"],["tg","Tajik","тоҷикӣ"],["th","Thai","ไทย"],["ti","Tigrinya","ትግርኛ"],
["tk","Turkmen","Türkmençe"],["tl","Tagalog","Wikang Tagalog"],["tn","Tswana","Setswana"],["to","Tonga","faka Tonga"],["tr","Turkish","Türkçe"],
["ts","Tsonga","Xitsonga"],["tt","Tatar","татар теле"],["tw","Twi","Twi"],["ty","Tahitian","Reo Tahiti"],["ug","Uyghur","ئۇيغۇرچە"],
["uk","Ukrainian","Українська"],["ur","Urdu","اردو"],["uz","Uzbek","Oʻzbek"],["ve","Venda","Tshivenḓa"],["vi","Vietnamese","Tiếng Việt"],
["vo","Volapük","Volapük"],["wa","Walloon","walon"],["wo","Wolof","Wollof"],["xh","Xhosa","isiXhosa"],["yi","Yiddish","ייִדיש"],
["yo","Yoruba","Yorùbá"],["za","Zhuang","Saɯ cueŋƅ"],["zh","Chinese","中文"],["zu","Zulu","isiZulu"],
];
export const LANG_CODES = new Set(LANGUAGES.map(l => l[0]));
export const MAX_LANGS = 12;
// Als Skript aufgerufen: die Liste für den Browser ausgeben.
if (process.argv[1] && process.argv[1].endsWith("languages.mjs")) {
  const sorted = [...LANGUAGES].sort((a, b) => a[1].localeCompare(b[1], "en"));
  process.stdout.write("/* languages.js — erzeugt aus api/languages.mjs; nicht von Hand ändern. ISO 639-1 plus gsw. */\nwindow.__languages = " + JSON.stringify(sorted) + ";\n");
}
