import { TreatmentCategory } from './types';

// Default catalog if none exists in storage
export const DEFAULT_CATALOG: TreatmentCategory[] = [
  {
    id: "cat_root_canal",
    name: "根管治疗",
    items: [
      { id: "1001", name: "根管治疗(前牙)", price: 500 },
      { id: "1002", name: "根管治疗(后牙)", price: 800 }
    ]
  },
  {
    id: "cat_resin",
    name: "树脂充填",
    items: [
      { id: "1003", name: "树脂充填(简单)", price: 200 },
      { id: "1004", name: "树脂充填(复杂)", price: 400 }
    ]
  },
  {
    id: "cat_prosthetics",
    name: "修复与种植",
    items: [
      { id: "1005", name: "全瓷冠修复", price: 2500 },
      { id: "1006", name: "种植体植入", price: 6000 }
    ]
  },
  {
    id: "cat_surgery",
    name: "外科与牙周",
    items: [
      { id: "1007", name: "超声波洁治(全口)", price: 150 },
      { id: "1008", name: "拔牙(简单)", price: 100 },
      { id: "1009", name: "拔牙(阻生智齿)", price: 800 }
    ]
  }
];

export const STORAGE_KEY = 'dental_clinic_data_v2';
export const BACKUP_SETTINGS_KEY = 'dental_clinic_backup_settings_v1';
export const CLOUD_SYNC_SETTINGS_KEY = 'dental_clinic_cloud_sync_settings_v1';
export const RELEASE_SETTINGS_KEY = 'dental_clinic_release_settings_v1';
export const DEFAULT_RELEASE_API_URL = 'https://api.github.com/repos/SlxBYR/dental-clinic-manager/releases/latest';
export const DATA_VERSION = 5;
export const APP_VERSION = '1.1.11';
