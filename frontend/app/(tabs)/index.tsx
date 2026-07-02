import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import type { AudioPlayer, AudioSource } from "expo-audio";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";

const API_URL = "http://192.168.1.8:8000/generate-story";

const genres = ["horror", "fantasy", "adventure", "sci-fi", "comedy"] as const;
const lengths = ["short", "medium", "long"] as const;

type Genre = (typeof genres)[number];
type StoryLength = (typeof lengths)[number];
type Theme = {
  label: string;
  tagline: string;
  isDark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  primary: string;
  primarySoft: string;
  text: string;
  textMuted: string;
  accent: string;
};
type ScatterPoint = {
  top: number;
  left: number;
  scale: number;
  rotate: number;
};
type Anchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const safelyCallPlayer = (
  player: AudioPlayer,
  action: (player: AudioPlayer) => void | Promise<void>,
) => {
  try {
    void Promise.resolve(action(player)).catch(() => {});
  } catch {
    // Expo can throw if a native shared object was released during a source swap.
  }
};

const narrators = [
  { id: "heart", name: "Heart", description: "Warm Female" },
  { id: "bella", name: "Bella", description: "Expressive Female" },
  { id: "nicole", name: "Nicole", description: "Calm Female" },
  { id: "adam", name: "Adam", description: "Deep Male" },
  { id: "michael", name: "Michael", description: "Clear Male" },
  { id: "emma", name: "Emma", description: "British Female" },
  { id: "daniel", name: "Daniel", description: "British Male" },
];

// A single retro monospaced face used everywhere — 16-bit UIs speak in one
// bespoke pixel font, not five different typefaces. If you drop a real
// pixel font (e.g. "PressStart2P") into assets and load it with
// expo-font/useFonts, just swap this constant for the loaded family name.
const PIXEL_FONT = Platform.OS === "ios" ? "Courier New" : "monospace";

// ---------------------------------------------------------------------------
// GENRE THEMES — palette per genre. Shape language (radius 0, thick beveled
// borders, pixel font) is now constant across genres; only color changes.
// ---------------------------------------------------------------------------
const THEMES: Record<Genre, Theme> = {
  horror: {
    label: "Horror",
    tagline: "Something is listening.",
    isDark: true,
    background: "#0a0908",
    surface: "#161211",
    surfaceAlt: "#1d1615",
    border: "#3a1f1f",
    primary: "#dc2626",
    primarySoft: "#3f1414",
    text: "#f2ece9",
    textMuted: "#8a7a78",
    accent: "#ef4444",
  },
  fantasy: {
    label: "Fantasy",
    tagline: "The old world stirs awake.",
    isDark: true,
    background: "#181330",
    surface: "#211a44",
    surfaceAlt: "#281f52",
    border: "#4a3b8f",
    primary: "#b09aff",
    primarySoft: "#332764",
    text: "#f2eeff",
    textMuted: "#a396d6",
    accent: "#f5c451",
  },
  adventure: {
    label: "Adventure",
    tagline: "The map ends where you begin.",
    isDark: true,
    background: "#1a1613",
    surface: "#25201a",
    surfaceAlt: "#2c261e",
    border: "#5a4429",
    primary: "#e08b2f",
    primarySoft: "#3d2b13",
    text: "#f4ead8",
    textMuted: "#b89a71",
    accent: "#e2b23c",
  },
  "sci-fi": {
    label: "Sci-Fi",
    tagline: "Signal acquired. Standing by.",
    isDark: true,
    background: "#05070a",
    surface: "#0c1116",
    surfaceAlt: "#101821",
    border: "#1c3540",
    primary: "#2dd4e8",
    primarySoft: "#0f2b33",
    text: "#dff8fb",
    textMuted: "#5c93a0",
    accent: "#5eead4",
  },
  comedy: {
    label: "Comedy",
    tagline: "This is going to go wrong.",
    isDark: false,
    background: "#fff8ec",
    surface: "#ffffff",
    surfaceAlt: "#fff1d6",
    border: "#f1c869",
    primary: "#f2711f",
    primarySoft: "#ffe1b8",
    text: "#4a2e13",
    textMuted: "#9c7a4a",
    accent: "#e8447a",
  },
};

// Shared 16-bit shape rules — same for every genre.
const PIXEL = {
  radius: 0,
  borderWidth: 3,
};

const GENRE_IMAGES: Record<Genre, ImageSourcePropType> = {
  horror: require("../../assets/images/horror.png"),
  fantasy: require("../../assets/images/fantasy.png"),
  adventure: require("../../assets/images/adventure.png"),
  "sci-fi": require("../../assets/images/sci-fi.png"),
  comedy: require("../../assets/images/comedy.png"),
};
const GENRE_AMBIANCE: Record<Genre, number> = {
  horror: require("../../assets/sounds/horror.mp3"),
  fantasy: require("../../assets/sounds/fantasy.mp3"),
  adventure: require("../../assets/sounds/adventure.mp3"),
  "sci-fi": require("../../assets/sounds/sci-fi.mp3"),
  comedy: require("../../assets/sounds/comedy.mp3"),
};
const GENRE_IMAGE_RESIZE_MODES: Record<Genre, "cover" | "contain"> = {
  horror: "cover",
  fantasy: "cover",
  adventure: "cover",
  "sci-fi": "cover",
  comedy: "cover",
};

// ---------------------------------------------------------------------------

// Returns a flat, single-color pixel border — no light/dark shading, no 3D
// bevel. Just a clean, uniform outline like a classic flat 16-bit UI.
function flatBorder(hex: string, thickness = PIXEL.borderWidth) {
  return {
    borderWidth: thickness,
    borderRadius: 0,
    borderColor: hex,
  };
}

// ---------------------------------------------------------------------------
// Small reusable primitives
// ---------------------------------------------------------------------------

// A chunky "push button" press: the whole element drops a few pixels while
// held, like a physical arcade button, instead of a smooth elastic scale.
function Pressy({
  children,
  style,
  onPress,
  disabled = false,
}: {
  children: ReactNode;
  style: StyleProp<ViewStyle>;
  onPress: () => void;
  disabled?: boolean;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const pressIn = () =>
    Animated.timing(translateY, {
      toValue: 3,
      duration: 60,
      useNativeDriver: true,
    }).start();
  const pressOut = () =>
    Animated.timing(translateY, {
      toValue: 0,
      duration: 90,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
    >
      <Animated.View style={[style, { transform: [{ translateY }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// Blocky loading indicator — square pixels, not soft dots.
function DotsLoader({ color }: { color: string }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(d, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0.3,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 140),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.dotsRow}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { backgroundColor: color, opacity: d }]}
        />
      ))}
    </View>
  );
}

// Pixel-bar underline that grows in with hard steps, no easing curve.
function DrawnUnderline({ color }: { color: string }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: 1,
      duration: 260,
      delay: 100,
      easing: Easing.step0,
      useNativeDriver: false,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.underline,
        {
          backgroundColor: color,
          width: width.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 48],
          }),
        },
      ]}
    />
  );
}

function SectionLabel({
  children,
  color,
}: {
  children: ReactNode;
  color: string;
}) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={[styles.sectionLabelBar, { backgroundColor: color }]} />
      <Text
        style={[styles.sectionLabelText, { color, fontFamily: PIXEL_FONT }]}
      >
        {children}
      </Text>
    </View>
  );
}

// A staircase arrow built from three shrinking bars — the pixel-art way to
// draw a chevron instead of an anti-aliased CSS triangle.
function PixelChevron({ color, open }: { color: string; open: boolean }) {
  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rotate, {
      toValue: open ? 1 : 0,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [open]);
  const deg = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <Animated.View
      style={{ transform: [{ rotate: deg }], alignItems: "center" }}
    >
      <View
        style={{
          width: 14,
          height: 3,
          backgroundColor: color,
          marginBottom: 3,
        }}
      />
      <View
        style={{ width: 8, height: 3, backgroundColor: color, marginBottom: 3 }}
      />
      <View style={{ width: 3, height: 3, backgroundColor: color }} />
    </Animated.View>
  );
}

// Dashed pixel divider used to break up sections.
function Ornament({ color }: { color: string }) {
  return (
    <View style={styles.ornamentRow}>
      {Array.from({ length: 9 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === 4 ? 9 : 4,
            height: 4,
            backgroundColor: color,
            opacity: i === 4 ? 1 : 0.45,
          }}
        />
      ))}
    </View>
  );
}

// Blocky sprite-style corner brackets over the hero photo.
function CornerFrame({ color }: { color: string }) {
  const base: ViewStyle = {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: color,
  };
  const thick = 5;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          base,
          { top: 8, left: 8, borderTopWidth: thick, borderLeftWidth: thick },
        ]}
      />
      <View
        style={[
          base,
          { top: 8, right: 8, borderTopWidth: thick, borderRightWidth: thick },
        ]}
      />
      <View
        style={[
          base,
          {
            bottom: 8,
            left: 8,
            borderBottomWidth: thick,
            borderLeftWidth: thick,
          },
        ]}
      />
      <View
        style={[
          base,
          {
            bottom: 8,
            right: 8,
            borderBottomWidth: thick,
            borderRightWidth: thick,
          },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// PixelIcon — genuine 8x8 pixel-art glyphs, drawn as a grid of squares from
// a hardcoded bitmap. 0 = empty, 1 = primary color, 2 = accent color.
// ---------------------------------------------------------------------------
const BITMAPS = {
  horror: [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 2, 1, 1, 2, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 0, 0, 1, 1, 0],
    [0, 1, 0, 1, 1, 0, 1, 0],
    [0, 0, 1, 0, 0, 1, 0, 0],
  ],
  fantasy: [
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 2, 2, 0, 0, 0],
    [1, 1, 2, 2, 2, 2, 1, 1],
    [0, 0, 0, 2, 2, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 0, 1],
  ],
  adventure: [
    [0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 0, 0],
    [1, 1, 2, 1, 2, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  "sci-fi": [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 2, 1, 1, 2, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  comedy: [
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 2, 1, 1, 2, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 2, 1, 1, 1, 1, 2, 1],
    [1, 1, 2, 2, 2, 2, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
  ],
};

function PixelIcon({
  genre,
  color,
  accent,
  size = 32,
}: {
  genre: Genre;
  color: string;
  accent: string;
  size?: number;
}) {
  const grid = BITMAPS[genre];
  const cell = size / 8;
  return (
    <View style={{ width: size, height: size }}>
      {grid.map((row, ry) =>
        row.map((v, rx) => {
          if (!v) return null;
          return (
            <View
              key={`${ry}-${rx}`}
              style={{
                position: "absolute",
                top: ry * cell,
                left: rx * cell,
                width: cell,
                height: cell,
                backgroundColor: v === 2 ? accent : color,
              }}
            />
          );
        }),
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Deterministic scatter pattern (no Math.random — never reflows on render)
// used for the per-genre background texture.
// ---------------------------------------------------------------------------
function pseudoRandom(seed: number) {
  const x = Math.sin(seed) * 43758.5453123;
  return x - Math.floor(x);
}
function generatePoints(seedBase: number, count: number) {
  const pts: ScatterPoint[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      top: pseudoRandom(seedBase * 1.37 + i * 12.9898) * 100,
      left: pseudoRandom(seedBase * 2.71 + i * 78.233) * 100,
      scale: 0.6 + pseudoRandom(seedBase * 3.14 + i * 4.67) * 0.8,
      rotate: pseudoRandom(seedBase * 5.19 + i * 9.13) * 360,
    });
  }
  return pts;
}
const TEXTURE_POINTS = {
  horror: generatePoints(11, 14),
  fantasy: generatePoints(23, 18),
  adventure: generatePoints(37, 14),
  "sci-fi": generatePoints(53, 16),
  comedy: generatePoints(67, 20),
};

// Static full-screen texture per genre — hard-edged squares only, no
// rounded corners, so it reads as pixel dither rather than soft blur.
function AmbientTexture({ genre, theme }: { genre: Genre; theme: Theme }) {
  const points = TEXTURE_POINTS[genre];

  if (genre === "sci-fi") {
    const lineCount = 26;
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: lineCount }).map((_, i) => (
          <View
            key={`l${i}`}
            style={{
              position: "absolute",
              top: `${(i / lineCount) * 100}%`,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: theme.primary,
              opacity: 0.05,
            }}
          />
        ))}
        {points.map((p, i) => (
          <View
            key={`d${i}`}
            style={{
              position: "absolute",
              top: `${p.top}%`,
              left: `${p.left}%`,
              width: 3,
              height: 3,
              backgroundColor: theme.accent,
              opacity: 0.18,
            }}
          />
        ))}
      </View>
    );
  }

  if (genre === "horror") {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {points.map((p, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              top: `${p.top}%`,
              left: `${p.left}%`,
              width: 2,
              height: 24 * p.scale,
              backgroundColor: theme.primary,
              opacity: 0.1,
              transform: [{ rotate: "-18deg" }],
            }}
          />
        ))}
      </View>
    );
  }

  if (genre === "fantasy") {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {points.map((p, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              top: `${p.top}%`,
              left: `${p.left}%`,
              width: 2,
              height: 100 * p.scale,
              backgroundColor: theme.primary,
              opacity: 0.1,
              transform: [{ rotate: "-18deg" }],
            }}
          >
            <View
              style={{ width: 2, height: 2, backgroundColor: theme.accent }}
            />
            <View
              style={{
                width: 6,
                height: 2,
                backgroundColor: theme.accent,
                position: "absolute",
                top: 0,
                left: -2,
              }}
            />
          </View>
        ))}
      </View>
    );
  }

  if (genre === "adventure") {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {points.map((p, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              top: `${p.top}%`,
              left: `${p.left}%`,
              opacity: 0.14,
            }}
          >
            <View
              style={{ width: 8, height: 2, backgroundColor: theme.accent }}
            />
            <View
              style={{
                width: 2,
                height: 8,
                backgroundColor: theme.accent,
                position: "absolute",
                top: -3,
                left: 3,
              }}
            />
          </View>
        ))}
      </View>
    );
  }

  // comedy — square confetti
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {points.map((p, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: `${p.top}%`,
            left: `${p.left}%`,
            width: 7 * p.scale,
            height: 7 * p.scale,
            backgroundColor: i % 2 ? theme.accent : theme.primary,
            opacity: 0.18,
            transform: [{ rotate: `${p.rotate}deg` }],
          }}
        />
      ))}
    </View>
  );
}

// Faint CRT scanlines over the whole screen — the one texture every 16-bit
// console shared, regardless of genre.
const SCREEN_HEIGHT = Dimensions.get("window").height;
const SCANLINE_COUNT = Math.ceil(SCREEN_HEIGHT / 4);
function ScanlineOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: SCANLINE_COUNT }).map((_, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: i * 4,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: "#000000",
            opacity: 0.045,
          }}
        />
      ))}
    </View>
  );
}

// A still photograph with a hard-stepped (not smooth) fade into the panel
// below it, mimicking limited-palette dithering instead of a gradient.
function GenreHero({
  genre,
  theme,
  source,
}: {
  genre: Genre;
  theme: Theme;
  source: ImageSourcePropType;
}) {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const resizeMode = GENRE_IMAGE_RESIZE_MODES[genre];

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.Image
        source={source}
        resizeMode={resizeMode}
        style={[styles.heroImage, { opacity: fadeIn }]}
        onLoad={() =>
          Animated.timing(fadeIn, {
            toValue: 1,
            duration: 200,
            easing: Easing.step0,
            useNativeDriver: true,
          }).start()
        }
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.background, opacity: 0.22 },
        ]}
      />
      <View pointerEvents="none" style={styles.heroFadeWrap}>
        <View
          style={[
            styles.heroFadeBand,
            { backgroundColor: theme.surfaceAlt, opacity: 0.15 },
          ]}
        />
        <View
          style={[
            styles.heroFadeBand,
            { backgroundColor: theme.surfaceAlt, opacity: 0.4 },
          ]}
        />
        <View
          style={[
            styles.heroFadeBand,
            { backgroundColor: theme.surfaceAlt, opacity: 0.65 },
          ]}
        />
        <View
          style={[
            styles.heroFadeBand,
            { backgroundColor: theme.surfaceAlt, opacity: 0.9 },
          ]}
        />
      </View>
    </View>
  );
}

function splitStoryIntoSentences(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+(?:["'”’])?|[^.!?]+$/g);

  return sentences
    ? sentences.map((sentence) => sentence.trim()).filter(Boolean)
    : [];
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const [genre, setGenre] = useState<Genre>("horror");
  const [length, setLength] = useState<StoryLength>("short");
  const [narrator, setNarrator] = useState("heart");
  const [story, setStory] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [ambienceEnabled, setAmbienceEnabled] = useState(true);
  const theme = THEMES[genre];
  const selectedNarrator =
    narrators.find((n) => n.id === narrator) ?? narrators[0];

  // Content cross-fades and lifts into place whenever the genre changes.
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    fade.setValue(0);
    lift.setValue(14);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 260,
        easing: Easing.step0,
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [genre]);

  // Story card animates in once content arrives.
  const storyAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (story) {
      storyAnim.setValue(0);
      Animated.timing(storyAnim, {
        toValue: 1,
        duration: 260,
        delay: 60,
        easing: Easing.step0,
        useNativeDriver: true,
      }).start();
    }
  }, [story]);

  // --- Narrator dropdown: a real anchored overlay, not an inline panel -----
  const triggerRef = useRef<View>(null);
  const triggerPress = useRef(new Animated.Value(0)).current;
  const dropdownAnim = useRef(new Animated.Value(0)).current;
  const [menuVisible, setMenuVisible] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const openDropdown = () => {
    if (!triggerRef.current) return;
    triggerRef.current.measureInWindow(
      (x: number, y: number, width: number, height: number) => {
        setAnchor({ x, y, width, height });
        setMenuVisible(true);
        dropdownAnim.setValue(0);
        Animated.timing(dropdownAnim, {
          toValue: 1,
          duration: 140,
          easing: Easing.step0,
          useNativeDriver: true,
        }).start();
      },
    );
  };

  const closeDropdown = () => {
    Animated.timing(dropdownAnim, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMenuVisible(false);
    });
  };

  const selectNarrator = (id: string) => {
    setNarrator(id);
    closeDropdown();
  };

  const audioSource = useMemo<AudioSource>(() => {
    return audioUrl ? { uri: audioUrl } : null;
  }, [audioUrl]);

  const ambienceSource = useMemo<AudioSource>(() => {
    return GENRE_AMBIANCE[genre];
  }, [genre]);

  const player = useAudioPlayer(null);
  const ambiencePlayer = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  const storySentences = useMemo(() => {
    return splitStoryIntoSentences(story);
  }, [story]);

  const narrationTime = Number.isFinite(playerStatus.currentTime)
    ? playerStatus.currentTime
    : 0;

  const narrationDuration = Number.isFinite(playerStatus.duration)
    ? playerStatus.duration
    : 0;

  const hasNarrationStarted = narrationTime > 0.15;
  const hasNarrationFinished =
    narrationDuration > 0 && narrationTime >= narrationDuration - 0.35;

  const currentSentenceIndex = useMemo(() => {
    if (!storySentences.length || !narrationDuration || !hasNarrationStarted) {
      return -1;
    }

    const totalCharacters = storySentences.reduce(
      (sum, sentence) => sum + sentence.length,
      0,
    );

    const estimatedReadCharacters =
      (narrationTime / narrationDuration) * totalCharacters;

    let characterCount = 0;

    for (let index = 0; index < storySentences.length; index++) {
      characterCount += storySentences[index].length;

      if (estimatedReadCharacters <= characterCount) {
        return index;
      }
    }

    return storySentences.length - 1;
  }, [storySentences, narrationTime, narrationDuration, hasNarrationStarted]);

  const playButtonLabel = playerStatus.playing
    ? "PLAYING"
    : hasNarrationStarted && !hasNarrationFinished
      ? "RESUME"
      : "PLAY";

  useEffect(() => {
    safelyCallPlayer(player, (currentPlayer) => {
      currentPlayer.replace(audioSource);
    });
  }, [audioSource, player]);

  useEffect(() => {
    safelyCallPlayer(ambiencePlayer, (currentPlayer) => {
      currentPlayer.replace(ambienceSource);
      currentPlayer.loop = true;
      currentPlayer.volume = 0.16;
    });
  }, [ambiencePlayer, ambienceSource]);

  useEffect(() => {
    if (hasNarrationFinished) {
      safelyCallPlayer(ambiencePlayer, (currentPlayer) => {
        currentPlayer.pause();
      });
    }
  }, [hasNarrationFinished, ambiencePlayer]);

  const generateStory = async () => {
    try {
      safelyCallPlayer(player, (currentPlayer) => {
        currentPlayer.pause();
      });
      safelyCallPlayer(ambiencePlayer, (currentPlayer) => {
        currentPlayer.pause();
      });
      setLoading(true);
      setStory("");
      setAudioUrl("");

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre, length, narrator }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to generate story.");
      }

      const data = await response.json();
      setStory(data.story);
      setAudioUrl(data.audio_url);
    } catch (error) {
      Alert.alert("Error", "Unable to generate story or narration.");
    } finally {
      setLoading(false);
    }
  };

  const playNarration = () => {
    if (!audioUrl) {
      Alert.alert("No audio", "Please generate a story first.");
      return;
    }

    const shouldStartFromBeginning = !hasNarrationStarted || hasNarrationFinished;

    safelyCallPlayer(player, (currentPlayer) => {
      if (shouldStartFromBeginning) {
        void currentPlayer.seekTo(0);
      }

      currentPlayer.play();
    });

    if (ambienceEnabled) {
      safelyCallPlayer(ambiencePlayer, (currentPlayer) => {
        if (shouldStartFromBeginning) {
          void currentPlayer.seekTo(0);
        }

        currentPlayer.play();
      });
    }
  };

  const pauseNarration = () => {
    safelyCallPlayer(player, (currentPlayer) => {
      currentPlayer.pause();
    });
    safelyCallPlayer(ambiencePlayer, (currentPlayer) => {
      currentPlayer.pause();
    });
  };

  const toggleAmbience = () => {
    setAmbienceEnabled((current) => {
      const next = !current;

      if (!next) {
        safelyCallPlayer(ambiencePlayer, (currentPlayer) => {
          currentPlayer.pause();
        });
      } else if (playerStatus.playing) {
        safelyCallPlayer(ambiencePlayer, (currentPlayer) => {
          currentPlayer.play();
        });
      }

      return next;
    });
  };

  const menuHeight = Math.min(narrators.length * 54, 320);
  const menuTop = anchor
    ? Math.min(anchor.y + anchor.height + 6, SCREEN_HEIGHT - menuHeight - 24)
    : 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} />

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <AmbientTexture genre={genre} theme={theme} />
      </Animated.View>
      <ScanlineOverlay />

      <ScrollView contentContainerStyle={styles.container}>
        <Animated.View
          style={{ opacity: fade, transform: [{ translateY: lift }] }}
        >
          <View style={styles.header}>
            <View style={styles.headerGlyph}>
              <PixelIcon
                genre={genre}
                color={theme.primary}
                accent={theme.accent}
                size={40}
              />
            </View>
            <Text
              style={[
                styles.title,
                {
                  color: theme.text,
                  fontFamily: PIXEL_FONT,
                  letterSpacing: 6,
                  textShadowColor: "rgba(0,0,0,0.55)",
                  textShadowOffset: { width: 3, height: 3 },
                  textShadowRadius: 0,
                },
              ]}
            >
              FABLES
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: theme.textMuted, fontFamily: PIXEL_FONT },
              ]}
            >
              {theme.tagline.toUpperCase()}
            </Text>
            <DrawnUnderline key={`underline-${genre}`} color={theme.accent} />
          </View>

          <View
            key={`hero-${genre}`}
            style={[
              styles.hero,
              { backgroundColor: theme.surfaceAlt },
              flatBorder(theme.border),
            ]}
          >
            <GenreHero
              genre={genre}
              theme={theme}
              source={GENRE_IMAGES[genre]}
            />
            <CornerFrame color={theme.accent} />
          </View>

          <SectionLabel color={theme.textMuted}>Genre</SectionLabel>
          <View style={styles.optionContainer}>
            {genres.map((item) => {
              const isSelected = genre === item;
              const itemTheme = THEMES[item];
              return (
                <Pressy
                  key={item}
                  onPress={() => setGenre(item)}
                  style={[
                    styles.genreChip,
                    {
                      backgroundColor: isSelected
                        ? itemTheme.primarySoft
                        : theme.surface,
                    },
                    flatBorder(isSelected ? itemTheme.primary : theme.border),
                  ]}
                >
                  <View style={styles.chipContent}>
                    <PixelIcon
                      genre={item}
                      color={isSelected ? itemTheme.primary : theme.textMuted}
                      accent={isSelected ? itemTheme.accent : theme.textMuted}
                      size={16}
                    />
                    <Text
                      style={[
                        styles.optionText,
                        {
                          color: isSelected ? itemTheme.text : theme.textMuted,
                          fontFamily: PIXEL_FONT,
                        },
                      ]}
                    >
                      {item.toUpperCase()}
                    </Text>
                  </View>
                </Pressy>
              );
            })}
          </View>

          <SectionLabel color={theme.textMuted}>Story Length</SectionLabel>
          <View style={styles.optionContainer}>
            {lengths.map((item) => {
              const isSelected = length === item;
              return (
                <Pressy
                  key={item}
                  onPress={() => setLength(item)}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor: isSelected
                        ? theme.primarySoft
                        : theme.surface,
                    },
                    flatBorder(isSelected ? theme.primary : theme.border),
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      {
                        color: isSelected ? theme.text : theme.textMuted,
                        fontFamily: PIXEL_FONT,
                      },
                    ]}
                  >
                    {item.toUpperCase()}
                  </Text>
                </Pressy>
              );
            })}
          </View>

          <SectionLabel color={theme.textMuted}>Narrator Voice</SectionLabel>

          <Pressable
            ref={triggerRef}
            onPress={openDropdown}
            onPressIn={() =>
              Animated.timing(triggerPress, {
                toValue: 3,
                duration: 60,
                useNativeDriver: true,
              }).start()
            }
            onPressOut={() =>
              Animated.timing(triggerPress, {
                toValue: 0,
                duration: 90,
                useNativeDriver: true,
              }).start()
            }
          >
            <Animated.View
              style={[
                styles.dropdownTrigger,
                {
                  backgroundColor: theme.surface,
                  transform: [{ translateY: triggerPress }],
                },
                flatBorder(theme.border),
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.narratorName,
                    { color: theme.text, fontFamily: PIXEL_FONT },
                  ]}
                >
                  {selectedNarrator.name.toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.narratorDescription,
                    { color: theme.textMuted, fontFamily: PIXEL_FONT },
                  ]}
                >
                  {selectedNarrator.description}
                </Text>
              </View>
              <PixelChevron color={theme.primary} open={menuVisible} />
            </Animated.View>
          </Pressable>

          <Pressy
            onPress={generateStory}
            disabled={loading}
            style={[
              styles.button,
              { backgroundColor: theme.primary, opacity: loading ? 0.75 : 1 },
              flatBorder(theme.primary),
            ]}
          >
            {loading ? (
              <DotsLoader color={theme.isDark ? "#ffffff" : "#1c1917"} />
            ) : (
              <Text
                style={[
                  styles.buttonText,
                  {
                    color: theme.isDark ? "#ffffff" : "#1c1917",
                    fontFamily: PIXEL_FONT,
                  },
                ]}
              >
                GENERATE {theme.label.toUpperCase()} STORY
              </Text>
            )}
          </Pressy>

          {story ? (
            <Animated.View
              style={[
                styles.storyCard,
                {
                  backgroundColor: theme.surfaceAlt,
                  opacity: storyAnim,
                  transform: [
                    {
                      translateY: storyAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [18, 0],
                      }),
                    },
                  ],
                },
                flatBorder(theme.border),
              ]}
            >
              <SectionLabel color={theme.accent}>
                Your {theme.label} Story
              </SectionLabel>
              <Ornament color={theme.border} />
              <Text
                style={[
                  styles.storyText,
                  { color: theme.text, fontFamily: PIXEL_FONT },
                ]}
              >
                {storySentences.map((sentence, index) => {
                  const isRead = hasNarrationStarted && index < currentSentenceIndex;
                  const isCurrent =
                    hasNarrationStarted &&
                    index === currentSentenceIndex &&
                    !hasNarrationFinished;

                  return (
                    <Text
                      key={`${sentence}-${index}`}
                      style={[
                        isRead && {
                          color: theme.primary,
                        },
                        isCurrent && {
                          backgroundColor: theme.primarySoft,
                          color: theme.text,
                        },
                      ]}
                    >
                      {sentence + " "}
                    </Text>
                  );
                })}
              </Text>

              <View style={styles.narratorRow}>
                <Pressy
                  onPress={playNarration}
                  style={[
                    styles.narratorButton,
                    { backgroundColor: theme.primary },
                    flatBorder(theme.primary),
                  ]}
                >
                  <Text
                    style={[
                      styles.narratorButtonText,
                      {
                        color: theme.isDark ? "#ffffff" : "#1c1917",
                        fontFamily: PIXEL_FONT,
                      },
                    ]}
                  >
                    {playButtonLabel}
                  </Text>
                </Pressy>

                <Pressy
                  onPress={pauseNarration}
                  style={[
                    styles.stopButton,
                    { backgroundColor: theme.surface },
                    flatBorder(theme.border),
                  ]}
                >
                  <Text
                    style={[
                      styles.stopButtonText,
                      { color: theme.text, fontFamily: PIXEL_FONT },
                    ]}
                  >
                    PAUSE
                  </Text>
                </Pressy>

                <Pressy
                  onPress={toggleAmbience}
                  style={[
                    styles.stopButton,
                    {
                      backgroundColor: ambienceEnabled
                        ? theme.primarySoft
                        : theme.surface,
                    },
                    flatBorder(ambienceEnabled ? theme.primary : theme.border),
                  ]}
                >
                  <Text
                    style={[
                      styles.stopButtonText,
                      {
                        color: ambienceEnabled ? theme.text : theme.textMuted,
                        fontFamily: PIXEL_FONT,
                      },
                    ]}
                  >
                    {ambienceEnabled ? "AMBI ON" : "AMBI OFF"}
                  </Text>
                </Pressy>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Proper anchored dropdown, rendered above everything via Modal */}
      <Modal
        transparent
        visible={menuVisible}
        animationType="none"
        onRequestClose={closeDropdown}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDropdown} />
        {anchor ? (
          <Animated.View
            style={[
              styles.dropdownMenu,
              {
                top: menuTop,
                left: anchor.x,
                width: anchor.width,
                maxHeight: menuHeight,
                backgroundColor: theme.surface,
                opacity: dropdownAnim,
                transform: [
                  {
                    translateY: dropdownAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-6, 0],
                    }),
                  },
                ],
              },
              flatBorder(theme.border),
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {narrators.map((item, idx) => {
                const isSelected = narrator === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => selectNarrator(item.id)}
                    style={({ pressed }) => [
                      styles.dropdownRow,
                      idx !== narrators.length - 1 && {
                        borderBottomWidth: 2,
                        borderBottomColor: theme.border,
                      },
                      isSelected && { backgroundColor: theme.primarySoft },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View>
                      <Text
                        style={[
                          styles.narratorName,
                          {
                            color: theme.text,
                            fontFamily: PIXEL_FONT,
                            fontSize: 14,
                          },
                        ]}
                      >
                        {item.name.toUpperCase()}
                      </Text>
                      <Text
                        style={[
                          styles.narratorDescription,
                          { color: theme.textMuted, fontFamily: PIXEL_FONT },
                        ]}
                      >
                        {item.description}
                      </Text>
                    </View>
                    {isSelected ? (
                      <View
                        style={[
                          styles.selectedDot,
                          { backgroundColor: theme.primary },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  container: {
    padding: 24,
    paddingTop: 64,
    paddingBottom: 60,
    flexGrow: 1,
  },
  header: {
    alignItems: "center",
    marginBottom: 4,
  },
  headerGlyph: {
    marginBottom: 10,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
    letterSpacing: 1,
  },
  underline: {
    height: 4,
    alignSelf: "center",
    marginTop: 12,
  },
  hero: {
    width: "100%",
    height: 170,
    marginTop: 24,
    overflow: "hidden",
    position: "relative",
  },
  heroImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  heroFadeWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    flexDirection: "column",
  },
  heroFadeBand: {
    flex: 1,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 26,
    marginBottom: 12,
  },
  sectionLabelBar: {
    width: 14,
    height: 4,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  optionContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  genreChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 84,
  },
  chipContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  optionText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  dropdownMenu: {
    position: "absolute",
    overflow: "hidden",
  },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  selectedDot: {
    width: 8,
    height: 8,
  },
  narratorName: {
    fontSize: 15,
    fontWeight: "800",
  },
  narratorDescription: {
    fontSize: 11,
    marginTop: 3,
  },
  button: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
  },
  storyCard: {
    padding: 20,
    marginTop: 28,
  },
  ornamentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 16,
  },
  storyText: {
    fontSize: 14,
    lineHeight: 24,
  },
  narratorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 20,
  },
  narratorButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  narratorButtonText: {
    fontWeight: "700",
    fontSize: 12,
  },
  stopButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  stopButtonText: {
    fontWeight: "700",
    fontSize: 12,
  },
});
