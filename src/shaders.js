export const VERT = `
  precision highp float;
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec3 aColorStart;
  attribute vec3 aColorEnd;
  attribute float aAlphaStart;
  attribute float aAlphaEnd;
  attribute float aSeed;
  attribute float aSize;

  uniform float uTime;
  uniform float uMorph;
  uniform float uScale;
  uniform float uPointSize;
  uniform float uDpr;
  uniform float uSwirl;
  uniform float uJitter;
  uniform float uOscAmplitude;
  uniform float uOscFrequency;
  uniform float uOscSpeed;
  uniform float uOscMode;

  varying vec3 vColor;
  varying float vAlpha;

  float easeInOut(float t){
    t = clamp(t, 0.0, 1.0);
    return t*t*(3.0 - 2.0*t);
  }

  void main(){
    float m = easeInOut(uMorph);
    vec3 pos = mix(aStart, aEnd, m);

    // Transition swirl
    float swirl = (1.0 - m) * uSwirl * (0.35 + fract(aSeed) * 0.65);
    float cs = cos(swirl);
    float sn = sin(swirl);
    pos.xy = mat2(cs, -sn, sn, cs) * pos.xy;

    // Gentle jitter (more when transitioning)
    float j = uJitter * (0.35 + 0.65*(1.0 - m));
    pos.x += sin(uTime*1.7 + aSeed*6.1) * j;
    pos.y += cos(uTime*1.3 + aSeed*5.3) * j;
    pos.z += sin(uTime*1.1 + aSeed*4.7) * (j*0.55);

    if(uOscAmplitude > 0.0){
      float phase = uTime * uOscSpeed;
      if(uOscMode < 0.5){
        // none
      } else if(uOscMode < 1.5){
        float gridWave = sin((pos.x + pos.y) * uOscFrequency + phase);
        pos.z += gridWave * uOscAmplitude * 0.35;
      } else {
        float r = length(pos.xy);
        float wave = sin(r * uOscFrequency - phase);
        pos.z += wave * uOscAmplitude * 0.45;
      }
    }

    pos.xy *= uScale;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = aSize * uPointSize * uDpr;
    gl_PointSize = size;

    vColor = mix(aColorStart, aColorEnd, m);
    vAlpha = mix(aAlphaStart, aAlphaEnd, m);
  }
`;

export const FRAG = `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;

  uniform float uSoftness;
  uniform float uShape;

  void main(){
    vec2 uv = gl_PointCoord.xy - 0.5;
    float d = 0.0;
    if(uShape < 0.5){
      d = length(uv);
    } else if(uShape < 1.5){
      d = max(abs(uv.x), abs(uv.y));
    } else if(uShape < 2.5){
      d = abs(uv.x) + abs(uv.y);
    } else {
      d = max(abs(uv.x), abs(uv.y));
    }

    float edge = 0.5;
    float aa = fwidth(d) * 1.25;
    float softness = (uShape > 2.5) ? 0.002 : max(uSoftness, 0.0005);
    float a = 1.0 - smoothstep(edge - softness - aa, edge + aa, d);
    a *= vAlpha;
    if(a < 0.01) discard;

    // Slight core brightness
    float core = 1.0 - smoothstep(0.0, 0.35, d);
    vec3 col = vColor + vColor * core * 0.25;

    gl_FragColor = vec4(col, a);
  }
`;

export const MEDIA_VERT = `
  precision highp float;
  varying vec2 vUv;

  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const MEDIA_FRAG = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uBrightness;
  uniform float uContrast;
  uniform float uSaturation;
  uniform float uGamma;
  varying vec2 vUv;

  vec3 applyTone(vec3 color){
    color = (color - 0.5) * uContrast + 0.5 + uBrightness;
    color = clamp(color, 0.0, 1.0);
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(lum), color, uSaturation);
    float safeGamma = max(uGamma, 0.001);
    color = pow(color, vec3(1.0 / safeGamma));
    return color;
  }

  void main(){
    vec4 tex = texture2D(uTexture, vUv);
    vec3 color = applyTone(tex.rgb);
    gl_FragColor = vec4(color, tex.a);
  }
`;
