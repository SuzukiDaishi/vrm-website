import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { VRM } from '@pixiv/three-vrm'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import TWEEN from '@tweenjs/tween.js'
import { mixamoClipToVRMClip } from './VRMAnimationClip'

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.y = 1
camera.position.z = -1.5
camera.lookAt(0, 1, 0)
const light = new THREE.AmbientLight(0xFFFFFF, 5)
scene.add(light)

const darkMaterial = new THREE.MeshBasicMaterial({color: 'black'})
const materials = {}

let renderer: THREE.WebGLRenderer

let model: VRM

let bloomComposer: EffectComposer
let finalComposer: EffectComposer
let bloomLayer: THREE.Layers

let bloomPass: UnrealBloomPass

let mixer: THREE.AnimationMixer
let clock = new THREE.Clock()
let walk: THREE.AnimationAction

const init = async () => {
  const renderScene = new RenderPass(scene, camera)

  bloomLayer = new THREE.Layers()
  bloomLayer.set(1)

  bloomPass = new UnrealBloomPass( 
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    1.5, 0.4, 0.85
  )

  renderer.toneMappingExposure = Math.pow(1, 4.0)
  bloomPass.threshold = 0
  bloomPass.strength = 1.5
  bloomPass.radius = 0

  bloomComposer = new EffectComposer(renderer)
  bloomComposer.addPass(renderScene)
  bloomComposer.addPass(bloomPass)
  bloomComposer.renderToScreen = false

  const finalPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
      fragmentShader: `
      uniform sampler2D baseTexture;
			uniform sampler2D bloomTexture;

			varying vec2 vUv;
			void main() {
				gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );
			}`,
      defines: {}
    }), 'baseTexture'
  )
  finalPass.needsSwap = true
  
  finalComposer = new EffectComposer(renderer)
  finalComposer.addPass(renderScene)
  finalComposer.addPass(finalPass)

  const gltfLoader = new GLTFLoader()
  const gltfModel = await gltfLoader.loadAsync('./3495132428620314658.vrm')
  model = await VRM.from(gltfModel)

  const faceIdx = model.scene.children.findIndex(elm=>elm.name==='Face')
  const eyesIdx = model.scene.children[faceIdx].children.findIndex(elm=>elm.name==='Face_(merged)(Clone)baked_1')

  model.scene.children[faceIdx].children[eyesIdx].layers.enable(1)

  scene.add(model.scene)

  mixer = new THREE.AnimationMixer(model.scene)
  const fbxLoader = new FBXLoader()
  const walkFbx = await fbxLoader.loadAsync('./xbot@Walking.fbx')
  console.log(walkFbx.animations[0])
  const walkClip = mixamoClipToVRMClip(walkFbx.animations[0], model, false)
  walkClip.name = 'walk'
  walk = mixer.clipAction(walkClip).setEffectiveWeight(1.0)
  walk.setLoop(THREE.LoopRepeat, Infinity)
  walk.clampWhenFinished = true
  console.log(walk);
  
  walk.play()
}

const animate = () => {
  requestAnimationFrame(animate)

  const delta = clock.getDelta()

  TWEEN.update()
  mixer.update(delta*1000)

  scene.traverse( (obj) => {
    if (
      obj instanceof THREE.Mesh &&
      bloomLayer.test( obj.layers ) === false
    ) {
      materials[obj.uuid] = obj.material
      obj.material = darkMaterial
    }
  })
  bloomComposer.render()  

  scene.traverse( (obj) => {
    if(
      obj instanceof THREE.Mesh && 
      materials[obj.uuid]
    ) {
      obj.material = materials[obj.uuid]
      delete materials[obj.uuid];
    }
  })
  finalComposer.render()
}

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  bloomComposer.setSize(window.innerWidth, window.innerHeight)
  finalComposer.setSize(window.innerWidth, window.innerHeight);
}

let useMotion = false
let isFront = false

const onTap = () => {
  if (!useMotion) {
    useMotion = true
    new TWEEN.Tween({ 
      cameraX: camera.position.x,
      cameraY: camera.position.y, 
      cameraZ: camera.position.z,
      lightIntensity: light.intensity,
      bloomThreshold: bloomPass.threshold,
    })
    .to({
      cameraX: 0,
      cameraY: isFront ? 1 : 1.35 , 
      cameraZ: isFront ? -1.5 : -0.3,
      lightIntensity: isFront ? 5 : 10,
      bloomThreshold: isFront ? 0 : 1,
    }, 250)
    .easing(TWEEN.Easing.Quadratic.InOut)
    .onUpdate((data) => {
      camera.position.x = data.cameraX
      camera.position.y = data.cameraY
      camera.position.z = data.cameraZ
      light.intensity = data.lightIntensity
      bloomPass.threshold = data.bloomThreshold
    })
    .onComplete(()=>{
      useMotion = false
      isFront = !isFront
    })
    .start()
  }
}

export const createScene = async (el: HTMLCanvasElement) => {
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: el, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ReinhardToneMapping
  await init()
  resize()
  animate()
}

window.addEventListener('click', onTap)
window.addEventListener('resize', resize)