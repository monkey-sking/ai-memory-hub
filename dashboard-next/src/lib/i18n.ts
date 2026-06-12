export type AppLanguage = 'zh' | 'en'

export interface AppOutletContext {
  language: AppLanguage
  toggleLanguage: () => void
}
