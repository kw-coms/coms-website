import { useEffect, useRef, useState } from 'react'
import { getLogoAsset } from '../../utils/logoAssets'

// Kwangwoon University position inside the normalized Korea grid (computed from
// the same projection as the coastline rings).
const KW_NX = 0.4725
const KW_NY = 0.5432

/**
 * Terminal-style boot intro (green ASCII on black): an ASCII Earth spins, the
 * camera rises into an ASCII silhouette of the Korean peninsula, then "COM'S"
 * types in with a blinking cursor before the overlay fades to reveal the home.
 * Reuses the real-GeoJSON Korea grid; renders as monospace characters whose
 * density tracks brightness. Short (~2.6s), skippable, plays once per page load.
 */

// Module-level so an SPA route change back to "/" doesn't replay it, but a full
// page reload (which re-imports the module) does.
let introPlayed = false

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Cheap value noise → blobby continents. Lattice hash, bilinear smoothed.
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

// Korean peninsula traced from real GeoJSON (South + North Korea coastlines),
// projected (cos-lat corrected, north up) and normalized to a 0..1 box with
// aspect preserved, then Douglas-Peucker simplified. Filled + sampled to a grid
// at runtime so the actual coastline detail and islands (incl. Jeju) read.
// rings=11 points=641
const KOREA_RINGS: Array<Array<[number, number]>> = [[[0.6849,0.04],[0.6801,0.0413],[0.6824,0.0437],[0.6773,0.0462],[0.6784,0.0493],[0.6707,0.0681],[0.6739,0.0715],[0.6698,0.0748],[0.6723,0.078],[0.6692,0.0809],[0.6693,0.0915],[0.6669,0.095],[0.6625,0.0949],[0.6602,0.0916],[0.6552,0.1011],[0.6476,0.0939],[0.6436,0.0927],[0.6431,0.0953],[0.6419,0.0925],[0.6399,0.0931],[0.6409,0.0965],[0.637,0.0963],[0.6383,0.0987],[0.6322,0.1002],[0.6339,0.1038],[0.6295,0.1048],[0.6319,0.1065],[0.6283,0.1106],[0.631,0.1157],[0.623,0.1217],[0.6199,0.12],[0.6165,0.1257],[0.6117,0.126],[0.6109,0.1326],[0.6084,0.1338],[0.5954,0.1302],[0.5921,0.1332],[0.5884,0.1317],[0.5801,0.1352],[0.5615,0.1324],[0.5474,0.1328],[0.5438,0.1352],[0.5488,0.1395],[0.5486,0.1523],[0.5535,0.1618],[0.5605,0.1658],[0.5641,0.1723],[0.5633,0.1779],[0.5588,0.1818],[0.5593,0.1863],[0.5529,0.1924],[0.5494,0.1943],[0.5492,0.1914],[0.5439,0.1915],[0.5421,0.1867],[0.5403,0.1894],[0.5366,0.1857],[0.5344,0.1884],[0.5321,0.1866],[0.5319,0.1905],[0.5216,0.1882],[0.5154,0.1882],[0.5159,0.1902],[0.5079,0.1869],[0.5076,0.1838],[0.494,0.1852],[0.4865,0.1832],[0.4893,0.1818],[0.4883,0.18],[0.4859,0.1813],[0.4851,0.1793],[0.4758,0.1778],[0.4815,0.1727],[0.4769,0.1718],[0.4704,0.1658],[0.474,0.1626],[0.4716,0.1586],[0.4629,0.1562],[0.4632,0.1521],[0.4581,0.1552],[0.4562,0.1611],[0.4543,0.1584],[0.4527,0.1597],[0.4531,0.1632],[0.4466,0.1585],[0.4446,0.1595],[0.4484,0.1613],[0.4416,0.1672],[0.4393,0.1655],[0.438,0.1708],[0.4362,0.1706],[0.438,0.1759],[0.4318,0.1875],[0.4331,0.1954],[0.4264,0.1951],[0.4159,0.2123],[0.403,0.2199],[0.4039,0.2248],[0.3991,0.2286],[0.3971,0.2348],[0.3928,0.2363],[0.3958,0.2369],[0.3945,0.2385],[0.3881,0.2392],[0.3883,0.2366],[0.3801,0.2408],[0.3772,0.2383],[0.3768,0.2404],[0.3732,0.2401],[0.3676,0.2468],[0.3716,0.2499],[0.3651,0.2508],[0.3632,0.2482],[0.3603,0.2545],[0.3571,0.2542],[0.3517,0.2589],[0.3521,0.2628],[0.3416,0.2602],[0.3403,0.2639],[0.3221,0.272],[0.3209,0.2749],[0.324,0.2757],[0.324,0.2785],[0.3169,0.2792],[0.313,0.2766],[0.3105,0.2821],[0.3027,0.2856],[0.3013,0.2906],[0.2925,0.295],[0.2775,0.3087],[0.2726,0.3158],[0.2751,0.3183],[0.2739,0.3241],[0.2729,0.3227],[0.2647,0.3286],[0.261,0.3406],[0.2676,0.3411],[0.2691,0.3354],[0.2727,0.335],[0.2807,0.3426],[0.286,0.344],[0.2852,0.3479],[0.2929,0.3519],[0.2926,0.3601],[0.3005,0.3557],[0.3023,0.3585],[0.3043,0.3573],[0.3047,0.3491],[0.3104,0.3506],[0.3124,0.3531],[0.3054,0.368],[0.3087,0.3698],[0.3174,0.3643],[0.3162,0.3561],[0.3234,0.358],[0.3264,0.3633],[0.3361,0.3626],[0.3409,0.3678],[0.346,0.3677],[0.3443,0.3723],[0.3489,0.3826],[0.3488,0.3894],[0.3419,0.3977],[0.3295,0.4249],[0.3325,0.4453],[0.328,0.4448],[0.3269,0.4498],[0.3228,0.4518],[0.3237,0.4457],[0.3191,0.4435],[0.3171,0.4534],[0.3205,0.4618],[0.3165,0.4635],[0.309,0.4756],[0.3098,0.485],[0.2948,0.4962],[0.3043,0.4995],[0.3138,0.498],[0.3205,0.5027],[0.3291,0.5016],[0.3268,0.5077],[0.32,0.5104],[0.3162,0.5159],[0.3307,0.5212],[0.3406,0.5192],[0.3292,0.5268],[0.3287,0.5287],[0.3319,0.5295],[0.3394,0.5255],[0.3424,0.5282],[0.3359,0.5304],[0.3379,0.533],[0.3357,0.5366],[0.3431,0.5345],[0.3465,0.5388],[0.3499,0.5347],[0.3556,0.5343],[0.3588,0.5298],[0.3679,0.5302],[0.3674,0.5259],[0.3702,0.5259],[0.3681,0.5221],[0.3758,0.5147],[0.3749,0.5079],[0.3876,0.5261],[0.3971,0.5258],[0.4069,0.5379],[0.4115,0.5312],[0.4093,0.5293],[0.4114,0.5251],[0.4203,0.5267],[0.4262,0.5232],[0.4362,0.5296],[0.4436,0.5284],[0.4457,0.5232],[0.4437,0.512],[0.455,0.5072],[0.4594,0.4982],[0.4654,0.4953],[0.4653,0.4901],[0.4782,0.4784],[0.4963,0.4767],[0.5047,0.4801],[0.5103,0.4764],[0.5186,0.4778],[0.5256,0.4753],[0.5286,0.4794],[0.5325,0.477],[0.5472,0.4789],[0.5623,0.4671],[0.5643,0.4527],[0.568,0.4503],[0.5686,0.4437],[0.5484,0.4276],[0.5404,0.4258],[0.5228,0.4011],[0.5171,0.4033],[0.5123,0.3988],[0.5052,0.3981],[0.502,0.3945],[0.5014,0.3985],[0.4973,0.3945],[0.4972,0.3886],[0.5014,0.3876],[0.5034,0.3801],[0.5053,0.3798],[0.5049,0.3872],[0.5106,0.3864],[0.5069,0.3666],[0.5112,0.3609],[0.5108,0.3569],[0.5051,0.3532],[0.5062,0.3456],[0.5099,0.3463],[0.51,0.3422],[0.5141,0.3392],[0.5163,0.3409],[0.5201,0.3366],[0.5336,0.3324],[0.5344,0.3252],[0.5424,0.318],[0.5507,0.3191],[0.5525,0.3236],[0.5573,0.3237],[0.5603,0.3161],[0.5665,0.3194],[0.5689,0.3133],[0.5743,0.313],[0.5909,0.3041],[0.5889,0.2942],[0.6064,0.2868],[0.6131,0.2797],[0.6209,0.2777],[0.6244,0.2744],[0.6312,0.2569],[0.6341,0.2557],[0.6373,0.2588],[0.6413,0.2524],[0.6529,0.2479],[0.6572,0.2438],[0.6675,0.2443],[0.6715,0.2331],[0.6683,0.2256],[0.6682,0.2099],[0.6745,0.1924],[0.667,0.1887],[0.6632,0.1821],[0.6671,0.1662],[0.6717,0.158],[0.6776,0.1574],[0.6801,0.1463],[0.6817,0.1435],[0.6853,0.1449],[0.6875,0.1361],[0.6891,0.1338],[0.6912,0.1351],[0.6942,0.1274],[0.701,0.1287],[0.7036,0.1186],[0.7105,0.1133],[0.7114,0.1184],[0.7161,0.1109],[0.7179,0.1117],[0.717,0.1041],[0.7215,0.1063],[0.7241,0.1032],[0.7312,0.1057],[0.7315,0.1108],[0.7397,0.1078],[0.7357,0.1032],[0.7376,0.1004],[0.7358,0.0965],[0.73,0.0942],[0.7312,0.0905],[0.7271,0.0845],[0.7268,0.078],[0.7224,0.0786],[0.7217,0.0839],[0.7185,0.0823],[0.7202,0.0782],[0.7167,0.079],[0.707,0.0689],[0.7073,0.0499],[0.6954,0.0494],[0.6992,0.0442],[0.6961,0.0425],[0.6893,0.045],[0.6854,0.0436],[0.6849,0.04]],[[0.568,0.4503],[0.5643,0.4527],[0.5623,0.4671],[0.5518,0.4767],[0.5472,0.4789],[0.5325,0.477],[0.5286,0.4794],[0.5256,0.4753],[0.5186,0.4778],[0.5103,0.4764],[0.5047,0.4801],[0.4963,0.4767],[0.4782,0.4784],[0.4653,0.4901],[0.4654,0.4953],[0.4594,0.4982],[0.455,0.5072],[0.4437,0.512],[0.4457,0.5232],[0.4436,0.5284],[0.4362,0.5296],[0.4262,0.5232],[0.4203,0.5267],[0.4114,0.5251],[0.4093,0.5293],[0.4115,0.5312],[0.4069,0.5379],[0.3988,0.5327],[0.4122,0.5432],[0.4149,0.5441],[0.416,0.5403],[0.4221,0.5464],[0.4158,0.5491],[0.4205,0.5533],[0.4223,0.5641],[0.4252,0.5684],[0.4289,0.5677],[0.4286,0.5632],[0.4321,0.5623],[0.4369,0.5717],[0.4267,0.5738],[0.4256,0.5802],[0.4293,0.5814],[0.4309,0.5793],[0.4482,0.5975],[0.4416,0.5989],[0.4322,0.5939],[0.4247,0.5942],[0.4245,0.5981],[0.4173,0.5997],[0.4144,0.6081],[0.4068,0.6102],[0.4018,0.6217],[0.4029,0.625],[0.3973,0.631],[0.3993,0.6331],[0.4141,0.6335],[0.4174,0.6571],[0.4196,0.6598],[0.4181,0.664],[0.4225,0.6651],[0.4239,0.6617],[0.4314,0.6659],[0.43,0.6811],[0.436,0.6841],[0.4417,0.6922],[0.4323,0.6949],[0.4324,0.7011],[0.4378,0.7024],[0.4387,0.7105],[0.4421,0.7094],[0.4441,0.7116],[0.4396,0.713],[0.4372,0.7207],[0.4324,0.719],[0.4332,0.7224],[0.4279,0.7271],[0.429,0.7334],[0.4368,0.7338],[0.4377,0.736],[0.43,0.7384],[0.4157,0.7675],[0.4268,0.7808],[0.4255,0.7826],[0.423,0.7784],[0.4217,0.7794],[0.4193,0.7715],[0.4179,0.7746],[0.4138,0.773],[0.412,0.7775],[0.41,0.7732],[0.4062,0.7732],[0.3954,0.7776],[0.3948,0.7802],[0.3979,0.783],[0.4029,0.784],[0.401,0.7863],[0.4038,0.7889],[0.4032,0.7931],[0.4081,0.7935],[0.4112,0.798],[0.41,0.8014],[0.4179,0.8037],[0.4118,0.8151],[0.4135,0.823],[0.4118,0.8294],[0.4009,0.8379],[0.3999,0.8417],[0.4045,0.8487],[0.4196,0.8462],[0.4229,0.8426],[0.4254,0.832],[0.4278,0.8404],[0.4313,0.8418],[0.4281,0.8481],[0.429,0.8504],[0.432,0.8487],[0.4312,0.8527],[0.4344,0.8559],[0.4403,0.8545],[0.4413,0.8463],[0.4408,0.8507],[0.4444,0.8541],[0.4514,0.855],[0.4545,0.8514],[0.4553,0.8538],[0.4604,0.8529],[0.4651,0.8466],[0.4653,0.8419],[0.4609,0.8421],[0.4607,0.8397],[0.4661,0.8398],[0.4687,0.826],[0.478,0.8169],[0.4822,0.8168],[0.4853,0.8115],[0.4836,0.819],[0.4756,0.829],[0.475,0.8403],[0.4834,0.8425],[0.4859,0.8337],[0.4892,0.8407],[0.4933,0.8411],[0.4936,0.8375],[0.4976,0.8373],[0.5,0.8339],[0.5029,0.8421],[0.5083,0.8412],[0.5037,0.8318],[0.5055,0.8232],[0.5091,0.827],[0.5146,0.8263],[0.5153,0.8297],[0.5206,0.8288],[0.5187,0.8308],[0.5268,0.8373],[0.5253,0.8425],[0.5274,0.8432],[0.5294,0.8357],[0.5248,0.8299],[0.5247,0.827],[0.5279,0.8254],[0.5241,0.8088],[0.5257,0.8007],[0.5227,0.7995],[0.5263,0.798],[0.5261,0.794],[0.5286,0.7939],[0.5274,0.8039],[0.5319,0.814],[0.5371,0.8093],[0.5373,0.8148],[0.5466,0.8177],[0.5482,0.7964],[0.5546,0.799],[0.5586,0.7957],[0.5657,0.8009],[0.5646,0.8039],[0.5691,0.8125],[0.5732,0.8145],[0.5739,0.8078],[0.5749,0.8161],[0.5769,0.8134],[0.5819,0.8166],[0.5867,0.8163],[0.5924,0.8133],[0.5898,0.8099],[0.5959,0.8088],[0.5977,0.8042],[0.595,0.7881],[0.6039,0.789],[0.6047,0.7832],[0.6122,0.7863],[0.6176,0.7829],[0.6223,0.7835],[0.6251,0.7756],[0.633,0.7694],[0.6356,0.7595],[0.6427,0.7547],[0.6432,0.7454],[0.6485,0.7439],[0.6505,0.7326],[0.649,0.7281],[0.6592,0.6913],[0.6547,0.6853],[0.6488,0.6915],[0.6456,0.689],[0.6482,0.6841],[0.6446,0.6761],[0.6444,0.6625],[0.6491,0.6484],[0.6462,0.6381],[0.6505,0.6313],[0.6511,0.6225],[0.6473,0.614],[0.6471,0.5953],[0.6415,0.5838],[0.6405,0.5744],[0.6252,0.5523],[0.6249,0.5469],[0.6202,0.5422],[0.6209,0.5391],[0.5879,0.4941],[0.5724,0.4555],[0.568,0.4503]],[[0.4545,0.9204],[0.4303,0.9246],[0.4118,0.9336],[0.4061,0.9415],[0.4056,0.947],[0.4128,0.9596],[0.4151,0.96],[0.4194,0.9538],[0.4394,0.9535],[0.4585,0.9443],[0.467,0.9275],[0.4646,0.9242],[0.4574,0.9233],[0.4545,0.9204]],[[0.3987,0.793],[0.392,0.7998],[0.3968,0.8013],[0.4015,0.808],[0.3973,0.8104],[0.3994,0.815],[0.4087,0.8177],[0.4078,0.8043],[0.4049,0.8061],[0.4037,0.8045],[0.4067,0.8004],[0.3987,0.793]],[[0.4402,0.8572],[0.4357,0.8573],[0.4342,0.8634],[0.4306,0.8662],[0.433,0.8703],[0.4357,0.8693],[0.4393,0.872],[0.4369,0.8678],[0.4404,0.8674],[0.4434,0.8709],[0.4452,0.8669],[0.4435,0.8651],[0.4456,0.864],[0.4399,0.8605],[0.4402,0.8572]],[[0.3922,0.8039],[0.3903,0.808],[0.3875,0.8068],[0.3857,0.812],[0.3915,0.8204],[0.3962,0.8173],[0.392,0.8115],[0.3952,0.8069],[0.3922,0.8039]],[[0.3973,0.818],[0.3955,0.8187],[0.3978,0.8188],[0.3981,0.8226],[0.3955,0.8191],[0.3914,0.8257],[0.3954,0.8262],[0.3984,0.8318],[0.4031,0.826],[0.4003,0.8222],[0.4021,0.8216],[0.3985,0.8219],[0.3973,0.818]],[[0.354,0.809],[0.3524,0.8112],[0.3545,0.8144],[0.3473,0.8176],[0.3485,0.8192],[0.3504,0.8173],[0.3506,0.8228],[0.3568,0.8131],[0.354,0.809]],[[0.4003,0.5733],[0.4003,0.5801],[0.4085,0.5835],[0.4095,0.5806],[0.4003,0.5733]],[[0.3954,0.8471],[0.3958,0.8538],[0.4031,0.8566],[0.4012,0.8516],[0.3985,0.8521],[0.3954,0.8471]],[[0.3074,0.4542],[0.3042,0.4598],[0.3139,0.4607],[0.3074,0.4542]]]

// Rasterize every ring to a boolean grid of the given square resolution (once).
function buildKoreaGrid(size: number): boolean[][] {
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  const c = cv.getContext('2d')
  if (!c) return []
  c.fillStyle = '#fff'
  for (const ring of KOREA_RINGS) {
    c.beginPath()
    ring.forEach(([x, y], i) => {
      const px = x * size
      const py = y * size
      if (i === 0) c.moveTo(px, py)
      else c.lineTo(px, py)
    })
    c.closePath()
    c.fill()
  }
  const data = c.getImageData(0, 0, size, size).data
  const grid: boolean[][] = []
  for (let r = 0; r < size; r++) {
    const row: boolean[] = []
    for (let col = 0; col < size; col++) {
      row.push(data[(r * size + col) * 4 + 3] > 128)
    }
    grid.push(row)
  }
  return grid
}

const FADE = 420

// True when the user prefers reduced motion — the intro (canvas animation) is
// skipped entirely in that case so no motion plays and no canvas work runs.
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function ComsIntro() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Skip the intro outright under reduced-motion: start `gone` so the overlay
  // never renders and the mount effect bails before any canvas work. This is
  // gated ONLY on the media query, never on the once-per-load flag, so a normal
  // load still plays.
  const [gone, setGone] = useState(() => prefersReducedMotion() || introPlayed)
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (prefersReducedMotion() || introPlayed) return
    introPlayed = true

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const koreaGrid = buildKoreaGrid(224)
    const kN = koreaGrid.length

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // real COM's cube logo for the finale (bridges into the home page)
    const logoImg = new Image()
    logoImg.src = getLogoAsset('COMs_logo_vec')
    let logoReady = false
    logoImg.onload = () => { logoReady = true }

    // phase timeline (ms): earth → korea(+KW lock) → ASCII COM'S → real cube logo
    const EARTH_OUT = 1150
    const KOREA_IN = 850
    const KOREA_OUT = 2400
    const PIN_IN = 1500
    const LOGO_IN = 2000 // ASCII COM'S types
    const LOGO_OUT = 2600
    const CUBE_IN = 2750 // real cube logo fades in
    const DONE = 3700

    // boot-sequence log lines [appearAt ms, text]
    const BOOT_LOG: Array<[number, string]> = [
      [0, 'kw-coms://boot --init'],
      [250, 'acquiring uplink ........ ok'],
      [650, 'scanning planet ......... ok'],
      [1150, 'locating KR  37.6N 127.0E'],
      [1700, 'lock: Kwangwoon Univ.'],
      [2150, 'launch COM’S _'],
    ]

    const RAMP = " .,:;irs20A#@"
    const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
    // Live site theme tokens so the boot screen matches the home page in BOTH
    // light and dark. Read every frame (not once at mount): this child effect
    // runs before the parent App effect that sets [data-theme-mode], so at mount
    // the dark tokens aren't applied yet — by the first rAF they are, and this
    // also picks up a live light/dark toggle.
    let C_BG = '#f5f5f7'
    let C_INK = '#1d1d1f'
    let C_ACCENT = '#0071e3'
    let C_SOFT = '#e8f3ff'
    let C_MUTED = '#606063'
    const readTheme = () => {
      const cs = getComputedStyle(document.documentElement)
      const t = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb
      C_BG = t('--app-surface-soft', C_BG)
      C_INK = t('--app-text', C_INK)
      C_ACCENT = t('--app-accent', C_ACCENT)
      C_SOFT = t('--app-accent-soft', C_SOFT)
      C_MUTED = t('--app-muted', C_MUTED)
    }
    const lum = (hex: string) => {
      const m = hex.replace('#', '')
      if (m.length < 6) return 0.5
      const r = parseInt(m.slice(0, 2), 16)
      const g = parseInt(m.slice(2, 4), 16)
      const bl = parseInt(m.slice(4, 6), 16)
      return (0.299 * r + 0.587 * g + 0.114 * bl) / 255
    }
    let W = 0, H = 0, dpr = 1
    let cols = 0, rows = 0, cellW = 0, cellH = 0, fontPx = 0, asp = 1
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fontPx = Math.max(10, Math.round(Math.min(W, H) / 54))
      cellW = Math.max(6, Math.round(fontPx * 0.6))
      cellH = Math.max(8, Math.round(fontPx * 0.95))
      asp = cellH / cellW
      cols = Math.ceil(W / cellW) + 1
      rows = Math.ceil(H / cellH) + 1
    }
    resize()

    let raf = 0
    let start = 0
    let finishing = false
    const finish = () => {
      if (finishing) return
      finishing = true
      setFadingOut(true)
    }

    const stampEarth = (b: Float32Array, ccx: number, ccy: number, R: number, spin: number, alpha: number) => {
      if (alpha <= 0) return
      const lx = -0.5, ly = -0.5, lz = 0.71
      const y0 = Math.max(0, Math.floor(ccy - R / asp))
      const y1 = Math.min(rows - 1, Math.ceil(ccy + R / asp))
      const x0 = Math.max(0, Math.floor(ccx - R))
      const x1 = Math.min(cols - 1, Math.ceil(ccx + R))
      for (let row = y0; row <= y1; row++) {
        for (let col = x0; col <= x1; col++) {
          const nx = (col - ccx) / R
          const ny = ((row - ccy) * asp) / R
          const d2 = nx * nx + ny * ny
          if (d2 > 1) continue
          const nz = Math.sqrt(1 - d2)
          const sx = nx * Math.cos(spin) + nz * Math.sin(spin)
          const lon = sx * 2.2 + 4
          const lat = ny * 2.2 + 4
          const n = vnoise(lon * 1.7, lat * 1.7) * 0.6 + vnoise(lon * 3.4, lat * 3.4) * 0.4
          const land = n > 0.46
          const lam = clamp01(nx * lx + ny * ly + nz * lz) * 0.55 + 0.45
          const v = (land ? 0.6 + (n - 0.46) * 0.7 : 0.18) * lam
          const i = row * cols + col
          if (v * alpha > b[i]) b[i] = v * alpha
        }
      }
    }

    const stampKorea = (b: Float32Array, ccx: number, ccy: number, hChars: number, alpha: number) => {
      if (alpha <= 0) return
      // grid is a square, geo-accurate box; chars are taller than wide, so the
      // column span must be hChars*asp for the peninsula to keep real proportions
      // (without this it gets horizontally squished into a thin strip).
      const wChars = hChars * asp
      const y0 = Math.max(0, Math.floor(ccy - hChars / 2))
      const y1 = Math.min(rows - 1, Math.ceil(ccy + hChars / 2))
      const x0 = Math.max(0, Math.floor(ccx - wChars / 2))
      const x1 = Math.min(cols - 1, Math.ceil(ccx + wChars / 2))
      for (let row = y0; row <= y1; row++) {
        const gy = Math.floor(((row - ccy) / hChars + 0.5) * kN)
        if (gy < 0 || gy >= kN) continue
        const gr = koreaGrid[gy]
        for (let col = x0; col <= x1; col++) {
          const gx = Math.floor(((col - ccx) / wChars + 0.5) * kN)
          if (gx < 0 || gx >= kN || !gr[gx]) continue
          const i = row * cols + col
          const v = (0.78 + hash(col + 1.1, row + 2.3) * 0.22) * alpha
          if (v > b[i]) b[i] = v
        }
      }
    }

    // ASCII block-letter "COM'S" (5 rows tall), built once.
    const GLYPHS: Record<string, string[]> = {
      C: ['#####', '#    ', '#    ', '#    ', '#####'],
      O: ['#####', '#   #', '#   #', '#   #', '#####'],
      M: ['#   #', '## ##', '# # #', '#   #', '#   #'],
      "'": ['##', '##', '  ', '  ', '  '],
      S: ['#####', '#    ', '#####', '    #', '#####'],
    }
    const logoRows = ['', '', '', '', '']
    const word = ['C', 'O', 'M', "'", 'S']
    word.forEach((ch, wi) => {
      const g = GLYPHS[ch]
      for (let r = 0; r < 5; r++) logoRows[r] += g[r] + (wi < word.length - 1 ? ' ' : '')
    })
    const logoW = logoRows[0].length
    const logoGrid = logoRows.map((r) => Array.from({ length: logoW }, (_, c) => r[c] === '#'))

    const frame = (now: number) => {
      if (!start) start = now
      const t = now - start
      if (t >= DONE && !finishing) finish()
      readTheme()

      // paper background + a soft accent wash in the corner, like the home hero
      ctx.fillStyle = C_BG
      ctx.fillRect(0, 0, W, H)
      const wash = ctx.createRadialGradient(W * 0.82, H * 0.16, 0, W * 0.82, H * 0.16, Math.max(W, H) * 0.6)
      wash.addColorStop(0, C_SOFT)
      wash.addColorStop(1, C_BG)
      ctx.globalAlpha = 0.6
      ctx.fillStyle = wash
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
      // subtle vignette for depth (deeper in dark mode)
      const dark = lum(C_BG) < 0.4
      const vig = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.32, W / 2, H * 0.5, Math.max(W, H) * 0.72)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(1, dark ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.05)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, W, H)
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.font = fontPx + 'px ' + MONO

      const b = new Float32Array(cols * rows)
      const ccx = cols / 2
      const koreaCcy = rows * 0.48

      const eAlpha = clamp01(seg(t, 0, 220)) * (1 - easeInOut(seg(t, 800, EARTH_OUT)))
      if (eAlpha > 0) {
        const R = lerp(rows * 0.30, rows * 0.42, easeInOut(seg(t, 0, EARTH_OUT)))
        stampEarth(b, ccx, rows * 0.46, R, t * 0.0016, eAlpha)
      }
      const kAlpha = easeInOut(seg(t, KOREA_IN, KOREA_IN + 260)) * (1 - easeInOut(seg(t, 2100, KOREA_OUT)))
      const hC = lerp(rows * 0.5, rows * 0.82, easeOut(seg(t, KOREA_IN, 1900)))
      if (kAlpha > 0) stampKorea(b, ccx, koreaCcy, hC, kAlpha)

      const rampN = RAMP.length - 1
      ctx.fillStyle = C_INK
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const v = b[row * cols + col]
          if (v <= 0.05) continue
          const ch = RAMP[Math.min(rampN, Math.max(1, Math.round(v * rampN)))]
          ctx.globalAlpha = 0.12 + v * 0.8
          ctx.fillText(ch, col * cellW, row * cellH)
        }
      }
      ctx.globalAlpha = 1

      // KW lock-on reticle on the peninsula (accent HUD), contracts then pulses
      const pinA = easeOut(seg(t, PIN_IN, PIN_IN + 300)) * (1 - easeInOut(seg(t, 2150, KOREA_OUT)))
      if (pinA > 0.01) {
        const wC = hC * asp
        const px = (ccx + (KW_NX - 0.5) * wC) * cellW
        const py = (koreaCcy + (KW_NY - 0.5) * hC) * cellH
        const lock = easeOut(seg(t, PIN_IN, PIN_IN + 450))
        const ring = lerp(Math.min(W, H) * 0.12, Math.min(W, H) * 0.035, lock)
        ctx.save()
        ctx.globalAlpha = pinA
        ctx.strokeStyle = C_ACCENT
        ctx.fillStyle = C_ACCENT
        ctx.lineWidth = Math.max(1.5, Math.min(W, H) / 640)
        ctx.beginPath()
        ctx.arc(px, py, ring, 0, Math.PI * 2)
        ctx.stroke()
        const tk = ring * 0.5
        ;[[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          ctx.beginPath()
          ctx.moveTo(px + dx * (ring - tk), py + dy * (ring - tk))
          ctx.lineTo(px + dx * (ring + tk * 0.45), py + dy * (ring + tk * 0.45))
          ctx.stroke()
        })
        ctx.beginPath()
        ctx.arc(px, py, ring * 0.13 * (1 + 0.4 * Math.sin(t * 0.012)), 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = pinA * easeOut(seg(t, PIN_IN + 250, PIN_IN + 650))
        ctx.font = '600 ' + Math.round(fontPx * 0.95) + 'px ' + MONO
        ctx.textBaseline = 'middle'
        ctx.fillText("광운대 COM'S", px + ring + 8, py)
        ctx.restore()
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
      }

      // ASCII COM'S types in, then dissolves into the real cube logo
      const lA = easeInOut(seg(t, LOGO_IN, LOGO_IN + 300)) * (1 - easeInOut(seg(t, LOGO_OUT, LOGO_OUT + 260)))
      if (lA > 0) {
        const P = Math.max(2, Math.min(Math.floor(rows * 0.07), Math.floor((cols - 14) / (logoW + 3))))
        const ox = Math.round(cols / 2 - (logoW * P) / 2)
        const oy = Math.round(rows * 0.42 - (5 * P) / 2)
        const shown = Math.floor(seg(t, LOGO_IN, LOGO_IN + 500) * logoW)
        ctx.font = fontPx + 'px ' + MONO
        ctx.globalAlpha = lA
        ctx.fillStyle = C_INK
        for (let gr = 0; gr < 5; gr++) {
          for (let gc = 0; gc <= shown && gc < logoW; gc++) {
            if (!logoGrid[gr][gc]) continue
            for (let py = 0; py < P; py++)
              for (let px = 0; px < P; px++)
                ctx.fillText('#', (ox + gc * P + px) * cellW, (oy + gr * P + py) * cellH)
          }
        }
        const cc = Math.min(shown + 2, logoW + 1)
        if (Math.floor(t / 300) % 2 === 0) {
          ctx.fillStyle = C_ACCENT
          for (let py = 0; py < P; py++)
            for (let px = 0; px < P * 2; px++)
              ctx.fillText('#', (ox + cc * P + px) * cellW, (oy + 4 * P + py) * cellH)
        }
        ctx.globalAlpha = 1
      }

      // Real COM's cube logo finale — bridges into the home page
      const cubeA = easeInOut(seg(t, CUBE_IN, CUBE_IN + 450))
      if (cubeA > 0 && logoReady) {
        const sz = Math.min(W, H) * 0.2
        const sc = lerp(0.9, 1, easeOut(seg(t, CUBE_IN, CUBE_IN + 550)))
        const cyc = H * 0.43
        ctx.globalAlpha = cubeA
        // the cube asset is black; invert it in dark mode so it reads white,
        // matching how the home page renders it (filter: invert(1)).
        ctx.filter = dark ? 'invert(1) brightness(1.08)' : 'none'
        ctx.drawImage(logoImg, W / 2 - (sz * sc) / 2, cyc - (sz * sc) / 2, sz * sc, sz * sc)
        ctx.filter = 'none'
        ctx.fillStyle = C_INK
        ctx.font = '700 ' + Math.round(sz * 0.4) + 'px ui-sans-serif, system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText("COM's", W / 2, cyc + sz * 0.74)
        ctx.globalAlpha = 1
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
      }

      // boot-sequence log, typed line by line, top-left
      ctx.font = Math.round(fontPx * 0.92) + 'px ' + MONO
      ctx.fillStyle = C_MUTED
      let ly = cellH * 1.3
      for (const [at, text] of BOOT_LOG) {
        if (t < at) break
        const shownC = Math.min(text.length, Math.floor((t - at) / 24))
        const caret = shownC < text.length && Math.floor(t / 280) % 2 === 0 ? '▮' : ''
        ctx.globalAlpha = 0.5
        ctx.fillText('› ' + text.slice(0, shownC) + caret, cellW * 1.6, ly)
        ly += cellH * 1.45
      }
      ctx.globalAlpha = 1

      if (!finishing || t < DONE + 50) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    const skip = () => finish()
    window.addEventListener('keydown', skip)
    window.addEventListener('wheel', skip, { passive: true })
    window.addEventListener('touchstart', skip, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('wheel', skip)
      window.removeEventListener('touchstart', skip)
      document.body.style.overflow = prevOverflow
    }
  }, [])

  useEffect(() => {
    if (!fadingOut) return
    document.body.style.overflow = ''
    const id = window.setTimeout(() => setGone(true), FADE)
    return () => window.clearTimeout(id)
  }, [fadingOut])

  if (gone) return null

  return (
    <div
      onClick={() => setFadingOut(true)}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, opacity: fadingOut ? 0 : 1, transition: 'opacity ' + FADE + 'ms ease', background: 'var(--app-surface-soft)', cursor: 'pointer' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setFadingOut(true) }}
        style={{ position: 'absolute', right: 18, bottom: 16, padding: '6px 14px', borderRadius: 999, border: '1px solid var(--app-hairline)', background: 'var(--app-surface)', color: 'var(--app-muted)', fontSize: 12, fontFamily: 'ui-monospace, monospace', fontWeight: 600, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}
      >
        skip ›
      </button>
    </div>
  )
}
