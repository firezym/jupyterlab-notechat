import { NotebookPanel } from '@jupyterlab/notebook'

// 自定义弹出通知界面，在toolbar的下方弹出
export const showCustomNotification = async (
    message: string,
    panel: NotebookPanel,
    timeout: number = 2000
  ): Promise<void> => {

    // 内部计时器id
    let timeoutId: number | null = null

    // 保存当前焦点的元素
    const currentFocus = document.activeElement as HTMLElement

    // 重新启动倒计时
    const restartTimeout = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(removeNotification, timeout)
    }

    // 移除timer
    const clearTimer = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    // 移除之前的通知
    const removeNotification = () => {
      // 清除挂起的定时器
      clearTimer()
      // 从通知元素移除事件监听器
      notification.removeEventListener('mouseenter', clearTimer)
      notification.removeEventListener('mouseleave', restartTimeout)
      // 清除通知元素
      if (document.body.contains(notification)) {
        document.body.removeChild(notification)
      }
      // 恢复焦点到之前的元素
      if (currentFocus && typeof currentFocus.focus === 'function') {
        currentFocus.focus();
      }
    }
    
    // 创建通知元素
    const notification = document.createElement('div')
    notification.className = 'notification'
    notification.innerHTML = message
    // 假设 `panel` 是当前的 NotebookPanel 实例，通知设置在工具栏底部
    const toolbar = panel.toolbar.node
    const toolbarRect = toolbar.getBoundingClientRect()
    notification.style.top = `${toolbarRect.bottom}px`

    // 创建关闭按钮，为关闭按钮添加点击事件处理器
    const closeButton = document.createElement('button')
    closeButton.textContent = '✖' // 或使用其他合适的字符或图标
    closeButton.className = 'notification-close' // 设置 CSS 类
    closeButton.addEventListener('click', removeNotification)

    // 绑定
    notification.appendChild(closeButton)
    document.body.appendChild(notification)

    // 鼠标悬停时清除倒计时
    notification.addEventListener('mouseenter', clearTimer)
    // 鼠标离开时重新开始倒计时
    notification.addEventListener('mouseleave', restartTimeout)
    // 开始初始倒计时
    restartTimeout()
}