import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // 自动更新 Service Worker
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'], // 静态资源
      manifest: {
        name: 'Brain Vault',
        short_name: 'BrainVault',
        description: '个人数字资产中枢与 AI 第二大脑',
        theme_color: '#4F46E5', // 匹配你 UI 的紫色主题
        background_color: '#f8fafc',
        display: 'standalone', // 这个属性最重要！它会隐藏浏览器的地址栏
        icons: [
          {
           src: '/logo.png', // 大图标也暂时指向它
           sizes: '180x180',
           type: 'image/png'
        }
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})