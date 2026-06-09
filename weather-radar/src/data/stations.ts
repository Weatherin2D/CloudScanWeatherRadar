export type StationCountry = "us" | "uk" | "au" | "eu";

export interface RadarStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country: StationCountry;
  countryCode: string;
  elevation?: number;
}

export {
  RADAR_PRODUCTS,
  STATION_RADAR_PRODUCTS,
  EU_STATION_PRODUCTS,
  type RadarProduct,
} from "@/lib/radarProducts";

export const COUNTRY_COLORS: Record<StationCountry, string> = {
  us: "#60a5fa",
  uk: "#f472b6",
  au: "#34d399",
  eu: "#fb923c",
};

export const COUNTRY_FLAGS: Record<string, string> = {
  us: "🇺🇸", uk: "🇬🇧", au: "🇦🇺",
  de: "🇩🇪", fr: "🇫🇷", nl: "🇳🇱", se: "🇸🇪", no: "🇳🇴",
  fi: "🇫🇮", dk: "🇩🇰", be: "🇧🇪", ch: "🇨🇭", at: "🇦🇹",
  cz: "🇨🇿", pl: "🇵🇱", es: "🇪🇸", it: "🇮🇹", ie: "🇮🇪",
  pt: "🇵🇹", hr: "🇭🇷", sk: "🇸🇰", hu: "🇭🇺", si: "🇸🇮",
  ro: "🇷🇴", bg: "🇧🇬", ee: "🇪🇪", lv: "🇱🇻", lt: "🇱🇹",
};

// ─── UK Met Office ────────────────────────────────────────────────────────────
export const UK_STATIONS: RadarStation[] = [
  { id: "chenies",       name: "Chenies",              lat: 51.69, lon: -0.49,  country: "uk", countryCode: "uk" },
  { id: "thurnham",      name: "Thurnham",              lat: 53.74, lon: -0.37,  country: "uk", countryCode: "uk" },
  { id: "clee_hill",     name: "Clee Hill",             lat: 52.4,  lon: -2.59,  country: "uk", countryCode: "uk" },
  { id: "castor_bay",    name: "Castor Bay",            lat: 54.51, lon: -6.31,  country: "uk", countryCode: "uk" },
  { id: "cobbacombe",    name: "Cobbacombe Cross",      lat: 51.1,  lon: -3.76,  country: "uk", countryCode: "uk" },
  { id: "hameldon_hill", name: "Hameldon Hill",         lat: 53.77, lon: -2.32,  country: "uk", countryCode: "uk" },
  { id: "ingham",        name: "Ingham",                lat: 53.33, lon: -0.55,  country: "uk", countryCode: "uk" },
  { id: "jersey",        name: "Jersey",                lat: 49.22, lon: -2.18,  country: "uk", countryCode: "uk" },
  { id: "middle_wallop", name: "Middle Wallop",         lat: 51.14, lon: -1.57,  country: "uk", countryCode: "uk" },
  { id: "hill_dudwick",  name: "Hill of Dudwick",       lat: 57.43, lon: -2.0,   country: "uk", countryCode: "uk" },
  { id: "munduff_hill",  name: "Munduff Hill",          lat: 56.27, lon: -3.26,  country: "uk", countryCode: "uk" },
  { id: "southerly",     name: "Southerly",             lat: 57.16, lon: -2.46,  country: "uk", countryCode: "uk" },
  { id: "predannack",    name: "Predannack",            lat: 49.99, lon: -5.22,  country: "uk", countryCode: "uk" },
  { id: "seathwaite",    name: "Seathwaite Tarn",       lat: 54.38, lon: -3.22,  country: "uk", countryCode: "uk" },
  { id: "rain_hill",     name: "Rainhill (Merseyside)", lat: 53.43, lon: -2.75,  country: "uk", countryCode: "uk" },
];

// ─── Australia BOM ────────────────────────────────────────────────────────────
export const AU_STATIONS: RadarStation[] = [
  // Major cities
  { id: "IDR71", name: "Sydney (Terrey Hills)",         lat: -33.701, lon: 151.210, country: "au", countryCode: "au" },
  { id: "IDR74", name: "Sydney West (Richmond)",        lat: -33.600, lon: 150.781, country: "au", countryCode: "au" },
  { id: "IDR43", name: "Wollongong (Appin)",            lat: -34.232, lon: 150.787, country: "au", countryCode: "au" },
  { id: "IDR03", name: "Melbourne (Laverton)",          lat: -37.858, lon: 144.756, country: "au", countryCode: "au" },
  { id: "IDR66", name: "Brisbane (Mt Stapylton)",       lat: -27.718, lon: 153.240, country: "au", countryCode: "au" },
  { id: "IDR16", name: "Brisbane (Marburg)",            lat: -27.608, lon: 152.539, country: "au", countryCode: "au" },
  { id: "IDR02", name: "Adelaide (Buckland Park)",      lat: -34.617, lon: 138.468, country: "au", countryCode: "au" },
  { id: "IDR33", name: "Adelaide (Sellicks Hill)",      lat: -35.329, lon: 138.503, country: "au", countryCode: "au" },
  { id: "IDR70", name: "Perth (Serpentine)",            lat: -32.392, lon: 116.030, country: "au", countryCode: "au" },
  { id: "IDR63", name: "Darwin (Berrimah)",             lat: -12.457, lon: 130.925, country: "au", countryCode: "au" },
  { id: "IDR97", name: "Hobart (Mt Koonya)",            lat: -43.112, lon: 147.808, country: "au", countryCode: "au" },
  { id: "IDR78", name: "Hobart (Cressy)",               lat: -41.775, lon: 147.011, country: "au", countryCode: "au" },
  // Queensland
  { id: "IDR64", name: "Cairns (Saddle Mtn)",           lat: -16.819, lon: 145.685, country: "au", countryCode: "au" },
  { id: "IDR67", name: "Townsville (Sellheim)",         lat: -19.419, lon: 146.551, country: "au", countryCode: "au" },
  { id: "IDR69", name: "Bowen",                         lat: -20.052, lon: 148.196, country: "au", countryCode: "au" },
  { id: "IDR68", name: "Mackay",                        lat: -21.117, lon: 149.217, country: "au", countryCode: "au" },
  { id: "IDR57", name: "Gladstone",                     lat: -23.855, lon: 151.263, country: "au", countryCode: "au" },
  { id: "IDR59", name: "Rockhampton",                   lat: -23.376, lon: 150.473, country: "au", countryCode: "au" },
  { id: "IDR19", name: "Emerald",                       lat: -23.550, lon: 148.239, country: "au", countryCode: "au" },
  { id: "IDR76", name: "Gympie",                        lat: -26.032, lon: 152.577, country: "au", countryCode: "au" },
  { id: "IDR65", name: "Mt Isa",                        lat: -20.712, lon: 139.573, country: "au", countryCode: "au" },
  { id: "IDR17", name: "Longreach",                     lat: -23.438, lon: 144.291, country: "au", countryCode: "au" },
  { id: "IDR62", name: "Willis Island",                 lat: -16.295, lon: 149.974, country: "au", countryCode: "au" },
  { id: "IDR28", name: "Weipa",                         lat: -12.660, lon: 141.920, country: "au", countryCode: "au" },
  // New South Wales / ACT
  { id: "IDR08", name: "Wagga Wagga",                   lat: -35.165, lon: 147.464, country: "au", countryCode: "au" },
  { id: "IDR10", name: "Canberra (Captains Flat)",      lat: -35.662, lon: 149.513, country: "au", countryCode: "au" },
  { id: "IDR14", name: "Namoi (Blackjack Mtn)",         lat: -30.535, lon: 150.192, country: "au", countryCode: "au" },
  { id: "IDR23", name: "Moree",                         lat: -29.499, lon: 149.851, country: "au", countryCode: "au" },
  // Victoria
  { id: "IDR09", name: "Yarrawonga",                    lat: -36.029, lon: 145.872, country: "au", countryCode: "au" },
  { id: "IDR15", name: "Bairnsdale",                    lat: -37.888, lon: 147.577, country: "au", countryCode: "au" },
  // South Australia / Northern Territory
  { id: "IDR04", name: "Woomera",                       lat: -31.153, lon: 136.805, country: "au", countryCode: "au" },
  { id: "IDR32", name: "Ceduna",                        lat: -32.130, lon: 133.696, country: "au", countryCode: "au" },
  { id: "IDR05", name: "Mildura",                       lat: -34.235, lon: 142.086, country: "au", countryCode: "au" },
  { id: "IDR52", name: "Katherine",                     lat: -14.499, lon: 132.447, country: "au", countryCode: "au" },
  { id: "IDR55", name: "Tennant Creek",                 lat: -19.640, lon: 134.186, country: "au", countryCode: "au" },
  { id: "IDR56", name: "Alice Springs",                 lat: -23.796, lon: 133.888, country: "au", countryCode: "au" },
  // Western Australia
  { id: "IDR06", name: "Geraldton",                     lat: -28.804, lon: 114.697, country: "au", countryCode: "au" },
  { id: "IDR07", name: "Kalgoorlie-Boulder",            lat: -30.784, lon: 121.455, country: "au", countryCode: "au" },
  { id: "IDR36", name: "Esperance",                     lat: -33.830, lon: 121.891, country: "au", countryCode: "au" },
  { id: "IDR37", name: "Albany",                        lat: -34.942, lon: 117.816, country: "au", countryCode: "au" },
  { id: "IDR79", name: "Broome",                        lat: -17.948, lon: 122.235, country: "au", countryCode: "au" },
  { id: "IDR40", name: "Marble Bar (Shay Gap)",         lat: -20.415, lon: 120.068, country: "au", countryCode: "au" },
  { id: "IDR46", name: "Carnarvon",                     lat: -24.888, lon: 113.670, country: "au", countryCode: "au" },
  { id: "IDR01", name: "Giles (Warakurna)",             lat: -25.033, lon: 128.298, country: "au", countryCode: "au" },
];

// ─── Europe (EUMETNET OPERA network) ─────────────────────────────────────────
export const EU_STATIONS: RadarStation[] = [
  // Germany (DWD)
  { id: "dwd_boo",  name: "Boostedt",          lat: 54.004, lon: 10.047,  country: "eu", countryCode: "de" },
  { id: "dwd_ros",  name: "Rostock",           lat: 54.175, lon: 12.058,  country: "eu", countryCode: "de" },
  { id: "dwd_eis",  name: "Eisberg",           lat: 49.541, lon: 12.403,  country: "eu", countryCode: "de" },
  { id: "dwd_ess",  name: "Essen",             lat: 51.405, lon: 6.967,   country: "eu", countryCode: "de" },
  { id: "dwd_fbg",  name: "Feldberg",          lat: 47.874, lon: 8.003,   country: "eu", countryCode: "de" },
  { id: "dwd_fld",  name: "Flechtdorf",        lat: 51.312, lon: 8.802,   country: "eu", countryCode: "de" },
  { id: "dwd_ham",  name: "Hamburg",           lat: 53.519, lon: 10.227,  country: "eu", countryCode: "de" },
  { id: "dwd_hnr",  name: "Hannover",          lat: 52.460, lon: 9.694,   country: "eu", countryCode: "de" },
  { id: "dwd_mem",  name: "Memmingen",         lat: 48.042, lon: 10.219,  country: "eu", countryCode: "de" },
  { id: "dwd_mhp",  name: "Munich",            lat: 48.175, lon: 11.622,  country: "eu", countryCode: "de" },
  { id: "dwd_neu",  name: "Neuhaus",           lat: 50.500, lon: 11.135,  country: "eu", countryCode: "de" },
  { id: "dwd_nhb",  name: "Neuheilenbach",     lat: 50.110, lon: 6.549,   country: "eu", countryCode: "de" },
  { id: "dwd_oft",  name: "Offenthal",         lat: 49.985, lon: 8.712,   country: "eu", countryCode: "de" },
  { id: "dwd_pro",  name: "Prötzel",           lat: 52.648, lon: 13.858,  country: "eu", countryCode: "de" },
  { id: "dwd_umd",  name: "Ummendorf",         lat: 52.160, lon: 11.176,  country: "eu", countryCode: "de" },
  { id: "dwd_drs",  name: "Dresden",           lat: 51.125, lon: 13.769,  country: "eu", countryCode: "de" },
  // France (Météo-France)
  { id: "fr_abbeville", name: "Abbeville",     lat: 50.136, lon: 1.832,   country: "eu", countryCode: "fr" },
  { id: "fr_arcis",     name: "Arcis-s-Aube",  lat: 48.578, lon: 4.163,   country: "eu", countryCode: "fr" },
  { id: "fr_avesnois",  name: "Avesnois",      lat: 50.135, lon: 3.813,   country: "eu", countryCode: "fr" },
  { id: "fr_bordeaux",  name: "Bordeaux",      lat: 44.826, lon: -0.690,  country: "eu", countryCode: "fr" },
  { id: "fr_brest",     name: "Brest",         lat: 48.449, lon: -4.419,  country: "eu", countryCode: "fr" },
  { id: "fr_cherburg",  name: "Cherbourg",     lat: 49.659, lon: -1.554,  country: "eu", countryCode: "fr" },
  { id: "fr_collobrières", name: "Collobrières", lat: 43.228, lon: 6.357, country: "eu", countryCode: "fr" },
  { id: "fr_paris",     name: "Paris (Trappes)", lat: 48.774, lon: 2.012, country: "eu", countryCode: "fr" },
  { id: "fr_lyon",      name: "Lyon (Mt Colombier)", lat: 45.916, lon: 5.780, country: "eu", countryCode: "fr" },
  { id: "fr_nimes",     name: "Nîmes (Courbessac)", lat: 43.850, lon: 4.402, country: "eu", countryCode: "fr" },
  { id: "fr_marseille", name: "Marseille",     lat: 43.386, lon: 5.393,   country: "eu", countryCode: "fr" },
  { id: "fr_toulouse",  name: "Toulouse (Sénégats)", lat: 43.577, lon: 1.376, country: "eu", countryCode: "fr" },
  // Netherlands (KNMI)
  { id: "nl_den_helder", name: "Den Helder",  lat: 52.953, lon: 4.790,   country: "eu", countryCode: "nl" },
  { id: "nl_herwijnen",  name: "Herwijnen",   lat: 51.837, lon: 5.138,   country: "eu", countryCode: "nl" },
  // Belgium (RMI)
  { id: "be_jabbeke",    name: "Jabbeke",     lat: 51.191, lon: 3.065,   country: "eu", countryCode: "be" },
  { id: "be_wideumont",  name: "Wideumont",   lat: 49.914, lon: 5.505,   country: "eu", countryCode: "be" },
  // Switzerland (MeteoSwiss)
  { id: "ch_albis",      name: "Albis",       lat: 47.284, lon: 8.512,   country: "eu", countryCode: "ch" },
  { id: "ch_dole",       name: "La Dôle",     lat: 46.425, lon: 6.099,   country: "eu", countryCode: "ch" },
  { id: "ch_lema",       name: "Monte Lema",  lat: 46.042, lon: 8.833,   country: "eu", countryCode: "ch" },
  { id: "ch_plaine",     name: "Pointe de la Plaine Morte", lat: 46.370, lon: 7.487, country: "eu", countryCode: "ch" },
  // Sweden (SMHI)
  { id: "se_ank",  name: "Ängelholm",        lat: 56.355, lon: 12.853,  country: "eu", countryCode: "se" },
  { id: "se_arv",  name: "Arvidsjaur",       lat: 65.588, lon: 19.192,  country: "eu", countryCode: "se" },
  { id: "se_gaf",  name: "Gävle",            lat: 60.593, lon: 17.165,  country: "eu", countryCode: "se" },
  { id: "se_hud",  name: "Hudiksvall",       lat: 61.716, lon: 17.115,  country: "eu", countryCode: "se" },
  { id: "se_kir",  name: "Kiruna",           lat: 67.878, lon: 21.046,  country: "eu", countryCode: "se" },
  { id: "se_lla",  name: "Luleå",            lat: 65.617, lon: 22.225,  country: "eu", countryCode: "se" },
  { id: "se_oer",  name: "Örnsköldsvik",     lat: 63.558, lon: 18.702,  country: "eu", countryCode: "se" },
  { id: "se_osd",  name: "Östersund",        lat: 63.397, lon: 14.808,  country: "eu", countryCode: "se" },
  { id: "se_sun",  name: "Sundsvall",        lat: 62.526, lon: 17.462,  country: "eu", countryCode: "se" },
  { id: "se_var",  name: "Vara",             lat: 58.254, lon: 12.974,  country: "eu", countryCode: "se" },
  { id: "se_vil",  name: "Vilebo",           lat: 57.266, lon: 16.476,  country: "eu", countryCode: "se" },
  // Norway (MET Norway)
  { id: "no_andoy",    name: "Andøya",       lat: 69.119, lon: 16.143,  country: "eu", countryCode: "no" },
  { id: "no_berlevaag", name: "Berlevåg",    lat: 70.858, lon: 29.028,  country: "eu", countryCode: "no" },
  { id: "no_hamar",    name: "Hamar",        lat: 60.810, lon: 11.068,  country: "eu", countryCode: "no" },
  { id: "no_hurum",    name: "Hurum",        lat: 59.603, lon: 10.456,  country: "eu", countryCode: "no" },
  { id: "no_rissa",    name: "Rissa",        lat: 63.691, lon: 9.950,   country: "eu", countryCode: "no" },
  { id: "no_stad",     name: "Stad",         lat: 62.194, lon: 5.126,   country: "eu", countryCode: "no" },
  { id: "no_vaerland", name: "Vœrland",      lat: 58.861, lon: 5.656,   country: "eu", countryCode: "no" },
  // Finland (FMI)
  { id: "fi_anjalankoski", name: "Anjalankoski", lat: 60.904, lon: 26.900, country: "eu", countryCode: "fi" },
  { id: "fi_ikaalinen",   name: "Ikaalinen",    lat: 61.765, lon: 23.125, country: "eu", countryCode: "fi" },
  { id: "fi_kesalahti",   name: "Kesälahti",    lat: 61.954, lon: 29.978, country: "eu", countryCode: "fi" },
  { id: "fi_korpo",       name: "Korpo",        lat: 60.128, lon: 21.635, country: "eu", countryCode: "fi" },
  { id: "fi_kuopio",      name: "Kuopio",       lat: 62.866, lon: 27.381, country: "eu", countryCode: "fi" },
  { id: "fi_luosto",      name: "Luosto",       lat: 67.139, lon: 26.897, country: "eu", countryCode: "fi" },
  { id: "fi_petajavesi",  name: "Petäjävesi",   lat: 62.316, lon: 25.420, country: "eu", countryCode: "fi" },
  { id: "fi_utajarvi",    name: "Utajärvi",     lat: 64.774, lon: 26.302, country: "eu", countryCode: "fi" },
  { id: "fi_vantaa",      name: "Vantaa",       lat: 60.271, lon: 25.017, country: "eu", countryCode: "fi" },
  { id: "fi_vimpeli",     name: "Vimpeli",      lat: 63.101, lon: 23.822, country: "eu", countryCode: "fi" },
  // Denmark (DMI)
  { id: "dk_bornholm",    name: "Bornholm",     lat: 55.111, lon: 14.888, country: "eu", countryCode: "dk" },
  { id: "dk_romo",        name: "Rømø",         lat: 55.173, lon: 8.552,  country: "eu", countryCode: "dk" },
  { id: "dk_sindal",      name: "Sindal",       lat: 57.488, lon: 10.135, country: "eu", countryCode: "dk" },
  { id: "dk_stevns",      name: "Stevns",       lat: 55.354, lon: 12.452, country: "eu", countryCode: "dk" },
  { id: "dk_virring",     name: "Virring",      lat: 56.018, lon: 10.026, country: "eu", countryCode: "dk" },
  // Austria (ZAMG)
  { id: "at_braunau",     name: "Braunau",      lat: 48.249, lon: 13.169, country: "eu", countryCode: "at" },
  { id: "at_patscherkofel", name: "Patscherkofel", lat: 47.209, lon: 11.462, country: "eu", countryCode: "at" },
  { id: "at_rauchenwarth", name: "Rauchenwarth", lat: 48.080, lon: 16.571, country: "eu", countryCode: "at" },
  { id: "at_stb",         name: "St. Pölten",   lat: 48.223, lon: 15.497, country: "eu", countryCode: "at" },
  // Spain (AEMET)
  { id: "es_almeria",     name: "Almería",      lat: 36.831, lon: -2.408, country: "eu", countryCode: "es" },
  { id: "es_barcelona",   name: "Barcelona",    lat: 41.682, lon: 2.127,  country: "eu", countryCode: "es" },
  { id: "es_bilbao",      name: "Bilbao",       lat: 43.282, lon: -2.871, country: "eu", countryCode: "es" },
  { id: "es_madrid",      name: "Madrid",       lat: 40.372, lon: -3.980, country: "eu", countryCode: "es" },
  { id: "es_malaga",      name: "Málaga",       lat: 36.620, lon: -4.453, country: "eu", countryCode: "es" },
  { id: "es_sevilla",     name: "Sevilla",      lat: 37.420, lon: -6.033, country: "eu", countryCode: "es" },
  { id: "es_valencia",    name: "Valencia",     lat: 39.492, lon: -0.476, country: "eu", countryCode: "es" },
  { id: "es_zaragoza",    name: "Zaragoza",     lat: 41.666, lon: -0.890, country: "eu", countryCode: "es" },
  // Italy (Dept. Civil Protection)
  { id: "it_bric_della_croce", name: "Bric della Croce", lat: 44.973, lon: 7.733, country: "eu", countryCode: "it" },
  { id: "it_monte_lauro",      name: "Monte Lauro",      lat: 37.116, lon: 14.835, country: "eu", countryCode: "it" },
  { id: "it_monte_mac",        name: "Monte Macaion",    lat: 46.422, lon: 11.285, country: "eu", countryCode: "it" },
  { id: "it_rome",             name: "Rome (Mte Mario)", lat: 41.917, lon: 12.453, country: "eu", countryCode: "it" },
  { id: "it_bologna",          name: "San Pietro Capofiume", lat: 44.654, lon: 11.623, country: "eu", countryCode: "it" },
  // Poland (IMGW)
  { id: "pl_gdansk",    name: "Gdańsk",         lat: 54.384, lon: 18.456, country: "eu", countryCode: "pl" },
  { id: "pl_legionowo", name: "Legionowo",      lat: 52.405, lon: 20.961, country: "eu", countryCode: "pl" },
  { id: "pl_poznan",    name: "Poznań",         lat: 52.413, lon: 16.797, country: "eu", countryCode: "pl" },
  { id: "pl_rzeszow",   name: "Rzeszów",        lat: 50.114, lon: 22.037, country: "eu", countryCode: "pl" },
  { id: "pl_swidwin",   name: "Świdwin",        lat: 53.790, lon: 15.831, country: "eu", countryCode: "pl" },
  // Ireland (Met Éireann)
  { id: "ie_castor_bay", name: "Shannon",       lat: 52.702, lon: -8.902, country: "eu", countryCode: "ie" },
  { id: "ie_dublin",     name: "Dublin (Glen of the Downs)", lat: 53.003, lon: -6.091, country: "eu", countryCode: "ie" },
];

// All stations combined
export const ALL_STATIONS: RadarStation[] = [
  ...UK_STATIONS,
  ...AU_STATIONS,
  ...EU_STATIONS,
];
