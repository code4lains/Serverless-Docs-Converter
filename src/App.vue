<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale } from './locales'
import type { S3Config, ConversionOption, ConversionResult, ConversionProgress } from './types'
import { downloadBlob } from './utils/file-helpers'
import './styles/main.css'

const { t, locale } = useI18n()

const conversionOptions: ConversionOption[] = [
  { id: 'docx-to-md', from: 'docx', to: 'md', accept: '.docx', icon: '📄', needsS3: true, label: '' },
  { id: 'csv-to-md', from: 'csv', to: 'md', accept: '.csv', icon: '📊', needsS3: false, label: '' },
  { id: 'xlsx-to-md', from: 'xlsx', to: 'md', accept: '.xlsx', icon: '📗', needsS3: true, label: '' },
  { id: 'md-to-docx', from: 'md', to: 'docx', accept: '.md,.markdown,.txt', icon: '📝', needsS3: false, label: '' },
  { id: 'md-to-csv', from: 'md', to: 'csv', accept: '.md,.markdown,.txt', icon: '📋', needsS3: false, label: '' },
  { id: 'md-to-xlsx', from: 'md', to: 'xlsx', accept: '.md,.markdown,.txt', icon: '📈', needsS3: false, label: '' },
]

const selectedConversion = ref<string | null>(null)
const selectedFile = ref<File | null>(null)
const isDragging = ref(false)
const isConverting = ref(false)
const progressMessage = ref('')
const progressPercent = ref(0)
const conversionResult = ref<ConversionResult | null>(null)
const errorMessage = ref('')
const showS3Config = ref(false)

const s3Config = ref<S3Config>({
  endpoint: '',
  region: 'auto',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  publicUrl: '',
  pathPrefix: 'docs-converter/',
})

// Load S3 config from localStorage
const STORAGE_KEY = 'docs-converter-s3-config'
try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const parsed = JSON.parse(saved)
    s3Config.value = { ...s3Config.value, ...parsed }
  }
} catch {}

// Save S3 config on change
watch(s3Config, (val) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  } catch {}
}, { deep: true })

const currentOption = computed(() =>
  conversionOptions.find(o => o.id === selectedConversion.value) || null
)

const isS3Configured = computed(() => {
  const c = s3Config.value
  return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey && c.publicUrl)
})

const canConvert = computed(() =>
  selectedConversion.value && selectedFile.value && !isConverting.value
)

function toggleLocale() {
  const next = locale.value === 'zh' ? 'en' : 'zh'
  setLocale(next)
}

function selectConversion(id: string) {
  if (selectedConversion.value === id) {
    selectedConversion.value = null
  } else {
    selectedConversion.value = id
    selectedFile.value = null
    conversionResult.value = null
    errorMessage.value = ''
    progressMessage.value = ''
    progressPercent.value = 0
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFileSelect(files[0])
  }
}

function onFileInput(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    handleFileSelect(target.files[0])
  }
}

function handleFileSelect(file: File) {
  selectedFile.value = file
  conversionResult.value = null
  errorMessage.value = ''
}

function removeFile() {
  selectedFile.value = null
  conversionResult.value = null
  errorMessage.value = ''
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function triggerFileInput() {
  const input = document.getElementById('file-input') as HTMLInputElement
  input?.click()
}

const onProgress: ConversionProgress = (message: string, percent: number) => {
  progressMessage.value = message
  progressPercent.value = percent
}

async function startConversion() {
  if (!selectedFile.value || !selectedConversion.value) return

  isConverting.value = true
  conversionResult.value = null
  errorMessage.value = ''
  progressMessage.value = t('upload.loadingModule')
  progressPercent.value = 5

  try {
    const s3 = (currentOption.value?.needsS3 && isS3Configured.value)
      ? s3Config.value
      : null

    let result: ConversionResult

    switch (selectedConversion.value) {
      case 'docx-to-md': {
        const { convertDocxToMd } = await import('./converters/docx-to-md')
        result = await convertDocxToMd(selectedFile.value, s3, onProgress)
        break
      }
      case 'csv-to-md': {
        const { convertCsvToMd } = await import('./converters/csv-to-md')
        result = await convertCsvToMd(selectedFile.value, onProgress)
        break
      }
      case 'xlsx-to-md': {
        const { convertXlsxToMd } = await import('./converters/xlsx-to-md')
        result = await convertXlsxToMd(selectedFile.value, s3, onProgress)
        break
      }
      case 'md-to-docx': {
        const { convertMdToDocx } = await import('./converters/md-to-docx')
        result = await convertMdToDocx(selectedFile.value, onProgress)
        break
      }
      case 'md-to-csv': {
        const { convertMdToCsv } = await import('./converters/md-to-csv')
        result = await convertMdToCsv(selectedFile.value, onProgress)
        break
      }
      case 'md-to-xlsx': {
        const { convertMdToXlsx } = await import('./converters/md-to-xlsx')
        result = await convertMdToXlsx(selectedFile.value, onProgress)
        break
      }
      default:
        throw new Error('Unknown conversion type')
    }

    conversionResult.value = result
    progressMessage.value = t('upload.complete')
    progressPercent.value = 100
  } catch (err: any) {
    errorMessage.value = err.message || 'An unknown error occurred'
    progressMessage.value = ''
    progressPercent.value = 0
  } finally {
    isConverting.value = false
  }
}

function downloadResult() {
  if (conversionResult.value) {
    downloadBlob(conversionResult.value.blob, conversionResult.value.filename)
  }
}
</script>

<template>
  <div class="bg-pattern"></div>

  <div class="app-container">
    <!-- Header -->
    <header class="app-header">
      <div class="app-header__top-bar">
        <button class="lang-switch" @click="toggleLocale" :title="locale === 'zh' ? 'Switch to English' : '切换到中文'">
          <span class="lang-switch__icon">🌐</span>
          <span class="lang-switch__label">{{ locale === 'zh' ? 'EN' : '中文' }}</span>
        </button>
      </div>
      <div class="app-header__logo">
        <div class="app-header__icon">⚡</div>
        <h1 class="app-header__title">{{ $t('app.title') }}</h1>
      </div>
      <p class="app-header__subtitle">{{ $t('app.subtitle') }}</p>
    </header>

    <!-- Conversion Selector -->
    <section class="card">
      <div class="card__header" @click.stop>
        <div class="card__header-left">
          <span class="card__header-icon">🔄</span>
          <span class="card__header-title">{{ $t('conversion.selectTitle') }}</span>
        </div>
      </div>
      <div class="card__body">
        <div class="conversion-grid">
          <div
            v-for="option in conversionOptions"
            :key="option.id"
            class="conversion-card"
            :class="{ 'conversion-card--active': selectedConversion === option.id }"
            @click="selectConversion(option.id)"
          >
            <div class="conversion-card__content">
              <span class="conversion-card__icon">{{ option.icon }}</span>
              <div class="conversion-card__label">{{ $t(`conversion.options.${option.id}`) }}</div>
              <div class="conversion-card__meta">
                .{{ option.from }} → .{{ option.to }}
                <span v-if="option.needsS3"> · {{ $t('conversion.supportsMedia') }}</span>
              </div>
            </div>
            <div class="conversion-card__check">✓</div>
          </div>
        </div>
      </div>
    </section>

    <!-- S3 Config -->
    <section class="card">
      <div class="card__header" @click="showS3Config = !showS3Config">
        <div class="card__header-left">
          <span class="card__header-icon">☁️</span>
          <span class="card__header-title">{{ $t('s3.title') }}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span class="card__header-badge" v-if="isS3Configured">{{ $t('s3.configured') }}</span>
          <span class="card__header-badge" v-else>{{ $t('s3.optional') }}</span>
          <span class="card__chevron" :class="{ 'card__chevron--open': showS3Config }">▼</span>
        </div>
      </div>
      <div class="card__body" :class="{ 'card__body--collapsed': !showS3Config }">
        <div class="s3-config">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">{{ $t('s3.endpoint') }}</label>
              <input class="form-input" v-model="s3Config.endpoint" :placeholder="$t('s3.endpointPlaceholder')" />
            </div>
            <div class="form-group">
              <label class="form-label">{{ $t('s3.region') }}</label>
              <input class="form-input" v-model="s3Config.region" :placeholder="$t('s3.regionPlaceholder')" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('s3.bucket') }}</label>
            <input class="form-input" v-model="s3Config.bucket" :placeholder="$t('s3.bucketPlaceholder')" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">{{ $t('s3.accessKey') }}</label>
              <input class="form-input" v-model="s3Config.accessKeyId" :placeholder="$t('s3.accessKeyPlaceholder')" />
            </div>
            <div class="form-group">
              <label class="form-label">{{ $t('s3.secretKey') }}</label>
              <input class="form-input" type="password" v-model="s3Config.secretAccessKey" :placeholder="$t('s3.secretKeyPlaceholder')" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">{{ $t('s3.publicUrl') }}</label>
              <input class="form-input" v-model="s3Config.publicUrl" :placeholder="$t('s3.publicUrlPlaceholder')" />
              <div class="form-hint">{{ $t('s3.publicUrlHint') }}</div>
            </div>
            <div class="form-group">
              <label class="form-label">{{ $t('s3.pathPrefix') }}</label>
              <input class="form-input" v-model="s3Config.pathPrefix" :placeholder="$t('s3.pathPrefixPlaceholder')" />
              <div class="form-hint">{{ $t('s3.pathPrefixHint') }}</div>
            </div>
          </div>
          <div class="s3-config__status">
            <span class="s3-config__dot" :class="{ 's3-config__dot--active': isS3Configured }"></span>
            <span class="s3-config__status-text">
              {{ isS3Configured ? $t('s3.statusActive') : $t('s3.statusInactive') }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- File Drop Zone & Action -->
    <section class="card" v-if="currentOption">
      <div class="card__header" @click.stop>
        <div class="card__header-left">
          <span class="card__header-icon">📁</span>
          <span class="card__header-title">{{ $t('upload.title') }}</span>
        </div>
        <span class="card__header-badge">{{ $t(`conversion.options.${currentOption.id}`) }}</span>
      </div>
      <div class="card__body">
        <!-- Drop Zone -->
        <div
          class="dropzone"
          :class="{
            'dropzone--dragover': isDragging,
            'dropzone--has-file': selectedFile
          }"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @click="triggerFileInput"
        >
          <input
            id="file-input"
            type="file"
            :accept="currentOption.accept"
            @change="onFileInput"
          />
          <div class="dropzone__content" v-if="!selectedFile">
            <span class="dropzone__icon">{{ currentOption.icon }}</span>
            <div class="dropzone__title">{{ $t('upload.dropTitle', { ext: currentOption.from }) }}</div>
            <div class="dropzone__subtitle">{{ $t('upload.dropSubtitle') }}</div>
          </div>
          <div class="dropzone__content" v-else>
            <span class="dropzone__icon">✅</span>
            <div class="dropzone__title">{{ $t('upload.fileReady') }}</div>
            <div class="dropzone__file-info">
              <span class="dropzone__file-name">{{ selectedFile.name }}</span>
              <span class="dropzone__file-size">{{ formatFileSize(selectedFile.size) }}</span>
              <button class="dropzone__remove" @click.stop="removeFile">{{ $t('upload.remove') }}</button>
            </div>
          </div>
        </div>

        <!-- Action Button -->
        <div class="action-bar">
          <button
            class="btn btn--primary btn--lg btn--block"
            :disabled="!canConvert"
            @click="startConversion"
          >
            <span v-if="isConverting" class="btn__spinner"></span>
            <span v-else>⚡</span>
            {{ isConverting ? $t('upload.converting') : $t('upload.convertTo', { ext: currentOption.to }) }}
          </button>
        </div>

        <!-- Progress -->
        <div class="progress-section" v-if="isConverting || (progressPercent === 100 && conversionResult)">
          <div class="progress-bar">
            <div class="progress-bar__fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <div class="progress-text">
            <span class="progress-text__message">
              {{ progressMessage }}
            </span>
            <span class="progress-text__percent">{{ progressPercent }}%</span>
          </div>
        </div>

        <!-- Result -->
        <div class="result-section" v-if="conversionResult">
          <div class="result-section__info">
            <span class="result-section__icon">🎉</span>
            <div class="result-section__details">
              <div class="result-section__filename">{{ conversionResult.filename }}</div>
              <div class="result-section__size">{{ formatFileSize(conversionResult.blob.size) }}</div>
            </div>
          </div>
          <button class="btn btn--success" @click="downloadResult">
            ⬇ {{ $t('upload.download') }}
          </button>
        </div>

        <!-- Error -->
        <div class="error-section" v-if="errorMessage">
          <span class="error-section__icon">⚠️</span>
          <span class="error-section__message">{{ errorMessage }}</span>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="app-footer">
      <p>{{ $t('app.footer') }}</p>
    </footer>
  </div>
</template>
