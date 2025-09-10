/**
 * @fileoverview RobotFace component that renders SVG-based facial expressions
 */

import { useTheme } from "../ThemeProvider.jsx";
import { getThemeColor } from "../../utils/themeUtils.js";
import { robotFacePropTypes, robotFaceDefaultProps } from "./propTypes.js";
import { getAccessibleColors } from "./accessibility.js";
import "./RobotFaceAnimations.css";

/**
 * RobotFace component that renders different facial expressions using SVG
 * @param {Object} props - Component props
 * @param {string} props.expression - The facial expression to render ('happy', 'thinking', 'talking', 'concerned')
 * @param {boolean} [props.animated=true] - Whether to enable animations
 * @param {string} [props.size='md'] - Size variant for scaling
 * @param {Object} [props.theme] - Theme object for color customization
 * @returns {JSX.Element} The RobotFace SVG component
 */
const RobotFace = ({ expression, animated = true, size = 'md', theme: propTheme }) => {
  const contextTheme = useTheme();
  const theme = propTheme || contextTheme;
  // Size configurations for SVG scaling
  const sizeMap = {
    sm: { width: 40, height: 40, scale: 0.8 },
    md: { width: 56, height: 56, scale: 1.0 },
    lg: { width: 80, height: 80, scale: 1.2 }
  };

  const { width, height, scale } = sizeMap[size] || sizeMap.md;

  // Get theme colors with fallbacks ensuring proper contrast ratios
  const baseColors = {
    robotBody: getThemeColor('primary', 50, theme) || '#f8fafc',
    robotStroke: getThemeColor('gray', 600, theme) || '#475569', // Darker for better contrast
    happyMouth: getThemeColor('primary', 700, theme) || '#047857', // Darker for better contrast
    thinkingMouth: getThemeColor('secondary', 700, theme) || '#b45309', // Darker for better contrast
    thinkingBg: getThemeColor('secondary', 50, theme) || '#fefce8',
    thinkingSecondary: getThemeColor('secondary', 500, theme) || '#d97706', // Adjusted for contrast
    thinkingTertiary: getThemeColor('secondary', 400, theme) || '#f59e0b',
    talkingElements: getThemeColor('primary', 600, theme) || '#2563eb', // Darker for better contrast
    talkingBg: getThemeColor('primary', 50, theme) || '#eff6ff',
    talkingSecondary: getThemeColor('primary', 500, theme) || '#3b82f6',
    talkingTertiary: getThemeColor('primary', 400, theme) || '#60a5fa',
    errorElements: getThemeColor('tertiary', 700, theme) || '#b91c1c', // Darker for better contrast
    errorBg: getThemeColor('tertiary', 50, theme) || '#fef2f2',
    eyeColor: '#0f172a', // Darker for better contrast
    whiteHighlight: '#ffffff'
  };

  // Apply accessibility adjustments for high contrast and forced colors
  const colors = getAccessibleColors(baseColors);

  // Common SVG props with accessibility attributes
  const svgProps = {
    width,
    height,
    viewBox: "0 0 100 100",
    className: `robot-face-svg robot-expression-${expression} ${animated ? 'robot-animated' : 'robot-static'}`,
    "data-testid": "robot-face-svg",
    role: "presentation",
    "aria-hidden": "true",
    focusable: "false"
  };

  // Render different expressions based on the expression prop
  const renderExpression = () => {
    switch (expression) {
      case 'happy':
        return renderHappyExpression(scale, animated, colors);
      case 'thinking':
        return renderThinkingExpression(scale, animated, colors);
      case 'talking':
        return renderTalkingExpression(scale, animated, colors);
      case 'concerned':
        return renderConcernedExpression(scale, animated, colors);
      default:
        return renderHappyExpression(scale, animated, colors);
    }
  };

  return (
    <svg {...svgProps}>
      {renderExpression()}
    </svg>
  );
};

/**
 * Renders a happy facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for happy expression
 */
const renderHappyExpression = (scale, animated, colors) => (
  <g className="robot-face-happy">
    {/* Robot head/face circle */}
    <circle
      cx="50"
      cy="50"
      r="45"
      fill={colors.robotBody}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Eyes - happy/content */}
    <g className="robot-eyes">
      <circle
        cx="35"
        cy="40"
        r="4"
        fill={colors.eyeColor}
        className={animated ? "robot-eye robot-eye-blink" : "robot-eye"}
      />
      <circle
        cx="65"
        cy="40"
        r="4"
        fill={colors.eyeColor}
        className={animated ? "robot-eye robot-eye-blink" : "robot-eye"}
      />
    </g>

    {/* Happy mouth - smile */}
    <path
      d="M 35 65 Q 50 75 65 65"
      stroke={colors.happyMouth}
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
      className="robot-mouth robot-mouth-happy"
    />

    {/* Cheek highlights for happiness */}
    <circle cx="25" cy="55" r="3" fill={colors.happyMouth} opacity="0.3" className="robot-cheek" />
    <circle cx="75" cy="55" r="3" fill={colors.happyMouth} opacity="0.3" className="robot-cheek" />
  </g>
);

/**
 * Renders a thinking facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for thinking expression
 */
const renderThinkingExpression = (scale, animated, colors) => (
  <g className="robot-face-thinking">
    {/* Robot head/face circle */}
    <circle
      cx="50"
      cy="50"
      r="45"
      fill={colors.thinkingBg || '#fefce8'}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Eyes - focused/concentrated */}
    <g className="robot-eyes">
      <ellipse
        cx="35"
        cy="42"
        rx="3"
        ry="2"
        fill={colors.eyeColor}
        className="robot-eye"
      />
      <ellipse
        cx="65"
        cy="42"
        rx="3"
        ry="2"
        fill={colors.eyeColor}
        className="robot-eye"
      />
    </g>

    {/* Thinking mouth - neutral/slight frown */}
    <line
      x1="42"
      y1="68"
      x2="58"
      y2="68"
      stroke={colors.thinkingMouth}
      strokeWidth="2"
      strokeLinecap="round"
      className="robot-mouth robot-mouth-thinking"
    />

    {/* Thinking indicators - gears and dots */}
    <g className="robot-thinking-indicators">
      {/* Rotating gears */}
      <g className={animated ? "robot-gear robot-gear-rotate" : "robot-gear"}>
        <circle
          cx="75"
          cy="25"
          r="4"
          fill="none"
          stroke={colors.thinkingMouth}
          strokeWidth="1"
        />
        <circle cx="73" cy="23" r="0.5" fill={colors.thinkingMouth} />
        <circle cx="77" cy="23" r="0.5" fill={colors.thinkingMouth} />
        <circle cx="77" cy="27" r="0.5" fill={colors.thinkingMouth} />
        <circle cx="73" cy="27" r="0.5" fill={colors.thinkingMouth} />
      </g>

      <g className={animated ? "robot-gear robot-gear-rotate-reverse" : "robot-gear"}>
        <circle
          cx="82"
          cy="32"
          r="3"
          fill="none"
          stroke={colors.thinkingSecondary || '#f59e0b'}
          strokeWidth="0.8"
        />
        <circle cx="81" cy="30.5" r="0.3" fill={colors.thinkingSecondary || '#f59e0b'} />
        <circle cx="83" cy="30.5" r="0.3" fill={colors.thinkingSecondary || '#f59e0b'} />
        <circle cx="83" cy="33.5" r="0.3" fill={colors.thinkingSecondary || '#f59e0b'} />
        <circle cx="81" cy="33.5" r="0.3" fill={colors.thinkingSecondary || '#f59e0b'} />
      </g>

      {/* Pulsing thought dots */}
      <circle
        cx="70"
        cy="20"
        r="1"
        fill={colors.thinkingMouth}
        className={animated ? "robot-thinking-dot robot-thinking-pulse" : "robot-thinking-dot"}
      />
      <circle
        cx="85"
        cy="25"
        r="0.8"
        fill={colors.thinkingSecondary || '#f59e0b'}
        className={animated ? "robot-thinking-dot robot-thinking-pulse-delayed" : "robot-thinking-dot"}
      />
      <circle
        cx="78"
        cy="38"
        r="0.6"
        fill={colors.thinkingTertiary || '#fbbf24'}
        className={animated ? "robot-thinking-dot robot-thinking-pulse-delayed-2" : "robot-thinking-dot"}
      />
    </g>

    {/* Eyebrows - slightly furrowed */}
    <g className="robot-eyebrows">
      <line x1="30" y1="32" x2="40" y2="35" stroke={colors.robotStroke} strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="35" x2="70" y2="32" stroke={colors.robotStroke} strokeWidth="2" strokeLinecap="round" />
    </g>
  </g>
);

/**
 * Renders a talking facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for talking expression
 */
const renderTalkingExpression = (scale, animated, colors) => (
  <g className="robot-face-talking">
    {/* Robot head/face circle */}
    <circle
      cx="50"
      cy="50"
      r="45"
      fill={colors.talkingBg || '#eff6ff'}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Eyes - alert and engaged */}
    <g className="robot-eyes">
      <circle
        cx="35"
        cy="40"
        r="4"
        fill={colors.eyeColor}
        className="robot-eye"
      />
      <circle
        cx="65"
        cy="40"
        r="4"
        fill={colors.eyeColor}
        className="robot-eye"
      />
      {/* Eye highlights for alertness */}
      <circle cx="37" cy="38" r="1" fill={colors.whiteHighlight} className="robot-eye-highlight" />
      <circle cx="67" cy="38" r="1" fill={colors.whiteHighlight} className="robot-eye-highlight" />
    </g>

    {/* Talking mouth - animated oval */}
    <ellipse
      cx="50"
      cy="65"
      rx="8"
      ry="5"
      fill={colors.eyeColor}
      className={animated ? "robot-mouth robot-mouth-talking robot-mouth-animate" : "robot-mouth robot-mouth-talking"}
    />

    {/* Sound waves/speech indicators */}
    <g className="robot-speech-indicators">
      <path
        d="M 20 45 Q 15 50 20 55"
        stroke={colors.talkingElements}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        className={animated ? "robot-speech-wave robot-speech-wave-1" : "robot-speech-wave"}
      />
      <path
        d="M 15 40 Q 8 50 15 60"
        stroke={colors.talkingSecondary || '#60a5fa'}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        className={animated ? "robot-speech-wave robot-speech-wave-2" : "robot-speech-wave"}
      />
      <path
        d="M 10 35 Q 2 50 10 65"
        stroke={colors.talkingTertiary || '#93c5fd'}
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        className={animated ? "robot-speech-wave robot-speech-wave-3" : "robot-speech-wave"}
      />
    </g>
  </g>
);

/**
 * Renders a concerned/error facial expression
 * @param {number} scale - Scale factor for sizing
 * @param {boolean} animated - Whether animations are enabled
 * @param {Object} colors - Theme colors object
 * @returns {JSX.Element} SVG elements for concerned expression
 */
const renderConcernedExpression = (scale, animated, colors) => (
  <g className="robot-face-concerned">
    {/* Robot head/face circle */}
    <circle
      cx="50"
      cy="50"
      r="45"
      fill={colors.errorBg || '#fef2f2'}
      stroke={colors.robotStroke}
      strokeWidth="2"
      className="robot-head"
    />

    {/* Eyes - worried/concerned */}
    <g className="robot-eyes">
      <ellipse
        cx="35"
        cy="42"
        rx="3"
        ry="4"
        fill={colors.eyeColor}
        className="robot-eye"
      />
      <ellipse
        cx="65"
        cy="42"
        rx="3"
        ry="4"
        fill={colors.eyeColor}
        className="robot-eye"
      />
    </g>

    {/* Concerned mouth - downward curve */}
    <path
      d="M 35 70 Q 50 60 65 70"
      stroke={colors.errorElements}
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
      className="robot-mouth robot-mouth-concerned"
    />

    {/* Worried eyebrows */}
    <g className="robot-eyebrows">
      <line x1="28" y1="30" x2="42" y2="33" stroke={colors.robotStroke} strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="33" x2="72" y2="30" stroke={colors.robotStroke} strokeWidth="2" strokeLinecap="round" />
    </g>

    {/* Error indicator - exclamation or warning symbol */}
    <g className="robot-error-indicator">
      <circle
        cx="80"
        cy="25"
        r="6"
        fill={colors.errorElements}
        className={animated ? "robot-error-symbol robot-error-pulse" : "robot-error-symbol"}
      />
      <text
        x="80"
        y="29"
        textAnchor="middle"
        fill={colors.whiteHighlight}
        fontSize="8"
        fontWeight="bold"
        className="robot-error-text"
      >
        !
      </text>
    </g>
  </g>
);

// Set PropTypes and default props
RobotFace.propTypes = robotFacePropTypes;
RobotFace.defaultProps = robotFaceDefaultProps;

export default RobotFace;