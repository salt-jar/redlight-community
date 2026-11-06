<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CameraOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { apiUpdateProfile } from '@/api/users';
import { apiUploadImage } from '@/api/upload';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const open = computed({
  get: () => ui.profileEditorOpen,
  set: (value: boolean) => (value ? ui.openProfileEditor() : ui.closeProfileEditor()),
});

const nickname = ref('');
const avatarUrl = ref('');
const uploading = ref(false);
const saving = ref(false);
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

const charCount = computed(() => Array.from(nickname.value).length);
const nicknameValid = computed(
  () => charCount.value >= 2 && charCount.value <= 20 && !/[\u0000-\u001f\u007f]/.test(nickname.value),
);
const canSave = computed(() => nicknameValid.value && !uploading.value && !saving.value);
const previewUser = computed(() => ({
  nickname: nickname.value.trim() || auth.user?.nickname || '同志',
  avatarUrl: avatarUrl.value,
}));

watch(open, (value) => {
  if (value) {
    nickname.value = auth.user?.nickname || '';
    avatarUrl.value = auth.user?.avatarUrl || '';
    error.value = '';
  }
});

function triggerAvatarPicker() {
  if (uploading.value) return;
  fileInput.value?.click();
}

async function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    message.error('请选择图片文件');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    message.error('头像图片不能超过 5MB');
    return;
  }
  uploading.value = true;
  error.value = '';
  try {
    const result = await apiUploadImage(file);
    avatarUrl.value = result.url;
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    uploading.value = false;
  }
}

function clearAvatar() {
  avatarUrl.value = '';
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = '';
  try {
    const updated = await apiUpdateProfile({
      nickname: nickname.value.trim(),
      avatarUrl: avatarUrl.value,
    });
    auth.setUser(updated);
    message.success('个人资料已更新');
    ui.closeProfileEditor();
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <a-modal
    v-model:open="open"
    title="编辑个人资料"
    :width="460"
    :footer="null"
    destroy-on-close
    wrap-class-name="profile-edit-wrap"
  >
    <div class="profile-editor" data-testid="profile-edit-modal">
      <div class="avatar-section">
        <div class="avatar-preview" data-testid="avatar-preview">
          <UserAvatar :user="previewUser" :size="76" />
          <button
            class="avatar-camera"
            type="button"
            aria-label="上传头像"
            :disabled="uploading"
            @click="triggerAvatarPicker"
          >
            <CameraOutlined />
          </button>
        </div>
        <div class="avatar-meta">
          <p class="avatar-title">{{ uploading ? '头像上传中...' : '个人头像' }}</p>
          <p class="avatar-hint">支持 JPG / PNG / GIF / WebP，最大 5MB</p>
          <div class="avatar-actions">
            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              class="avatar-file"
              data-testid="avatar-input"
              @change="onAvatarChange"
            />
            <button class="avatar-btn" type="button" :disabled="uploading" data-testid="avatar-upload" @click="triggerAvatarPicker">
              <UploadOutlined />
              上传新头像
            </button>
            <button
              v-if="avatarUrl"
              class="avatar-btn ghost"
              type="button"
              :disabled="uploading"
              data-testid="avatar-clear"
              @click="clearAvatar"
            >
              <DeleteOutlined />
              恢复默认
            </button>
          </div>
        </div>
      </div>

      <label class="field">
        <span class="field-label">昵称</span>
        <a-input
          v-model:value="nickname"
          :maxlength="20"
          placeholder="请输入 2–20 个字符的昵称"
          data-testid="profile-nickname-input"
          @press-enter="save"
        />
        <span class="field-foot">
          <span class="field-hint">支持中文、字母、数字和 emoji，2–20 个字符</span>
          <span class="char-count" :class="{ invalid: charCount > 0 && !nicknameValid }">
            {{ charCount }}/20
          </span>
        </span>
      </label>

      <p v-if="error" class="edit-error">{{ error }}</p>
      <p v-else-if="nickname && !nicknameValid" class="edit-error">昵称长度需为 2–20 个字符</p>

      <div class="editor-actions">
        <button class="cancel-btn" type="button" @click="ui.closeProfileEditor()">取消</button>
        <button class="save-btn" type="button" :disabled="!canSave" data-testid="profile-save" @click="save">
          {{ saving ? '保存中...' : '保存修改' }}
        </button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.profile-editor {
  padding: 4px 2px 0;
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 4px 0 18px;
  border-bottom: 1px solid var(--rl-border-light);
}

.avatar-preview {
  position: relative;
  flex: 0 0 auto;
  width: 76px;
  height: 76px;
}

.avatar-preview :deep(.user-avatar) {
  box-shadow: 0 2px 10px rgba(80, 40, 20, 0.16);
}

.avatar-camera {
  position: absolute;
  right: -2px;
  bottom: -2px;
  display: flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--rl-primary);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.avatar-camera:disabled {
  opacity: 0.6;
  cursor: wait;
}

.avatar-meta {
  min-width: 0;
  flex: 1;
}

.avatar-title {
  margin: 0;
  color: var(--rl-text);
  font-size: 14px;
  font-weight: 600;
}

.avatar-hint {
  margin: 2px 0 8px;
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.avatar-file {
  display: none;
}

.avatar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #f0c9cf;
  border-radius: 5px;
  background: #fff8f7;
  color: var(--rl-primary);
  font-size: 12px;
  cursor: pointer;
}

.avatar-btn:hover:not(:disabled) {
  background: #fff1f0;
}

.avatar-btn.ghost {
  border-color: var(--rl-border);
  background: #fff;
  color: var(--rl-text-secondary);
}

.avatar-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.field {
  display: block;
  margin-top: 18px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  color: var(--rl-text-tertiary);
  font-size: 13px;
}

.field-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 5px;
}

.field-hint {
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.char-count {
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.char-count.invalid {
  color: var(--rl-primary);
}

.edit-error {
  margin: 8px 0 0;
  color: var(--rl-primary);
  font-size: 12px;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
  padding-top: 14px;
  border-top: 1px solid var(--rl-border-light);
}

.cancel-btn,
.save-btn {
  height: 36px;
  padding: 0 22px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.cancel-btn {
  border: 1px solid var(--rl-border);
  background: #fff;
  color: var(--rl-text-tertiary);
}

.save-btn {
  border: 1px solid var(--rl-primary);
  background: var(--rl-primary);
  color: #fff;
  font-weight: 600;
}

.save-btn:hover:not(:disabled) {
  background: var(--rl-primary-hover);
}

.save-btn:disabled {
  border-color: #e6dccd;
  background: #e6dccd;
  cursor: not-allowed;
}
</style>
