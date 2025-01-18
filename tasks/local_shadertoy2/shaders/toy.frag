#version 430


layout(location = 0) out vec4 fragColor;

layout(binding = 0) uniform sampler2D emp;
layout(binding = 1) uniform sampler2D iChannel0;
layout(push_constant) uniform pushed_params 

{
  uint resolution_x;
  uint resolution_y;
  float time;
  float mouse_x;
  float mouse_y;
} pushed_params_t;

float iTime;
vec2 iResolution;
vec2 iMouse;

const int MAX_MARCHING_STEPS = 255;
const float MIN_DIST = 0.0;
const float MAX_DIST = 100.0;
const float PRECISION = 1e-3;
const float RAD = 1.0;
const float FLOOR_SCALE = 1.0;

struct Sphere {
    vec3 center;
    float radius;
    float speed;
    float phase;
};

Sphere spheres[3];

void initializeSpheres() {
    spheres[0] = Sphere(vec3(0.0, 1.0, -1.0), RAD, 1.5, 0.0);
    spheres[1] = Sphere(vec3(-2.0, 1.0, -3.0), RAD, 2.0, 1.0);
    spheres[2] = Sphere(vec3(2.0, 1.0, -5.0), RAD, 1.8, 2.0);
}

float sdSphere(vec3 p, Sphere sphere) {
    float bounce = -4.9 * pow(mod(iTime * sphere.speed + sphere.phase, 2.0) - 1.0, 2.0) + 1.0;
    return length(p - vec3(sphere.center.x, sphere.center.y + bounce, sphere.center.z)) - sphere.radius;
}

float sceneSDF(vec3 p) {
    float d = 1e10;
    for (int i = 0; i < 3; i++) {
        d = min(d, sdSphere(p, spheres[i]));
    }
    return d;
}

float rayMarch(vec3 ro, vec3 rd, float start, float end) {
    float depth = start;

    for (int i = 0; i < MAX_MARCHING_STEPS; i++) {
        vec3 p = ro + depth * rd;
        float d = sceneSDF(p);
        depth += d;
        if (d < PRECISION || depth > end) break;
    }

    return depth;
}

vec3 calcNormal(vec3 p) {
    vec2 e = vec2(1.0, -1.0) * PRECISION;
    return normalize(
        e.xyy * sceneSDF(p + e.xyy) +
        e.yyx * sceneSDF(p + e.yyx) +
        e.yxy * sceneSDF(p + e.yxy) +
        e.xxx * sceneSDF(p + e.xxx)
    );
}

vec3 triPlanarProjection(vec3 p, vec3 normal, sampler2D tex) {
    normal = abs(normal);
    vec3 blend = normalize(pow(normal, vec3(10.0)));
    blend /= (blend.x + blend.y + blend.z);

    vec3 xTex = texture(tex, p.yz).rgb;
    vec3 yTex = texture(tex, p.zx).rgb;
    vec3 zTex = texture(tex, p.xy).rgb;

    return xTex * blend.x + yTex * blend.y + zTex * blend.z;
}

vec4 floorTexture(vec3 p) {
    vec3 texColor = texture(iChannel0, p.xz * FLOOR_SCALE).rgb;
    return vec4(texColor, 1.0);
}

vec3 staticTriPlanarProjection(vec3 worldPos, vec3 objectCenter, vec3 normal, sampler2D tex) {
    vec3 p = worldPos - objectCenter;
    return triPlanarProjection(p, normal, tex);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 mouse = iMouse.xy / iResolution.xy;
    if (iMouse.xy == vec2(0.0)) {
        mouse = vec2(0.3, 0.5);
    }
    float yaw = (mouse.x * 2.0 - 1.0) * 3.14159;
    float pitch = (mouse.y - 0.5) * 3.14159;

    vec3 forward = vec3(cos(yaw) * cos(pitch), sin(pitch), sin(yaw) * cos(pitch));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
    vec3 up = normalize(cross(forward, right));

    vec3 ro = vec3(0.0, 1.5, 5.0);
    vec3 rd = normalize(forward + (uv.x - 0.5) * right * (iResolution.x / iResolution.y) + (uv.y - 0.5) * up);

    initializeSpheres();

    float d = rayMarch(ro, rd, MIN_DIST, MAX_DIST);
    vec3 col = vec3(0.0);

    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 normal = calcNormal(p);

        for (int i = 0; i < 3; i++) {
            if (abs(sdSphere(p, spheres[i])) < PRECISION) {
                col = staticTriPlanarProjection(p, spheres[i].center, normal, iChannel0);
                break;
            }
        }

        vec3 lightPos = vec3(1.5, 5.0, 3.0);
        vec3 lightDir = normalize(lightPos - p);
        float diff = max(dot(normal, lightDir), 0.0);
        col *= diff;
    } else {
        float planeY = 0.0;
        float t = (planeY - ro.y) / rd.y;
        vec3 p = ro + t * rd;
        fragColor = floorTexture(p);
        return;
    }

    fragColor = vec4(col, 1.0);
}

void main( )
{
  ivec2 fragCoord = ivec2(gl_FragCoord.xy);

  iResolution = vec2(pushed_params_t.resolution_x, pushed_params_t.resolution_y);
  iTime = pushed_params_t.time;
  iMouse = vec2(pushed_params_t.mouse_x, pushed_params_t.mouse_y);

  mainImage(fragColor, fragCoord);
}
