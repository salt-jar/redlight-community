<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { FlagOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { apiErrorMessage } from '@/api/http';
import { apiCreateReport, REPORT_REASONS, type ReportTargetType } from '@/api/reports';

const props = defineProps<{
  open: boolean;
  targetType: ReportTargetType;
  targetId: number;
  targetTitle?: string;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
  (event: 'submitted'): void;
}>();

const reason = ref<string>(REPORT_REASONS[0]);
const detail = ref('');
const submitting = ref(false);
const error = ref('');

const title = computed(() => (props.targetType === 'book' ? '举报图书' : '举报文章'));

watch(
  () => props.open,
  (open) => {
    if (open) {
      reason.value = REPORT_REASONS[0];
      detail.value = '';
      error.value = '';
    }
  },
);

function close() {
  emit('update:open', false);
}

async function submit() {
  if (!reason.value) {
    error.value = '请选择举报原因';
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    await apiCreateReport({
      targetType: props.targetType,
      targetId: props.targetId,
      reason: reason.value,
      detail: detail.value.trim(),
    });
    message.success('举报已提交，管理员会尽快处理');
    emit('submitted');
    close();
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <a-modal
    :open="open"
    :title="title"
    :footer="null"
    :width="440"
    centered
    @cancel="close"
  >
    <div class="report-dialog" data-testid="report-dialog">
      <p class="report-target">{{ targetTitle || `#${targetId}` }}</p>
      <p class="report-label">举报原因</p>
      <a-radio-group v-model:value="reason" class="reason-list">
        <a-radio v-for="item in REPORT_REASONS" :key="item" :value="item">{{ item }}</a-radio>
      </a-radio-group>
      <p class="report-label">补充说明（选填）</p>
      <a-textarea
        v-model:value="detail"
        :rows="3"
        :maxlength="500"
        show-count
        placeholder="请描述具体问题，便于管理员核实"
        data-testid="report-detail"
      />
      <p v-if="error" class="report-error">{{ error }}</p>
      <div class="report-actions">
        <a-button @click="close">取消</a-button>
        <a-button type="primary" :loading="submitting" data-testid="report-submit" @click="submit">
          <FlagOutlined />
          提交举报
        </a-button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.report-dialog {
  padding-top: 4px;
}

.report-target {
  margin: 0 0 14px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fbf9f5;
  color: var(--rl-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.report-label {
  margin: 12px 0 8px;
  color: var(--rl-text);
  font-size: 13px;
  font-weight: 600;
}

.reason-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}

.report-error {
  margin: 8px 0 0;
  color: var(--rl-primary);
  font-size: 12px;
}

.report-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
</style>
