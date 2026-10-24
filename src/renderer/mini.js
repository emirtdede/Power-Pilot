        // Listen for ticks
        if (window.electronAPI && window.electronAPI.onTimerTick) {
            window.electronAPI.onTimerTick((data) => {
                const actionText = document.getElementById('action-text');
                const countdownText = document.getElementById('countdown-text');

                if (actionText) {
                    actionText.textContent = data.actionText || '--';
                }
                if (countdownText) {
                    countdownText.textContent = data.formattedCountdown || '00:00';
                }
            });
        }

        // Hide button action (send widget to background)
        document.getElementById('btn-hide').addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.hideMiniWidget) {
                window.electronAPI.hideMiniWidget();
            }
        });

        // Restore button action (show main app window)
        document.getElementById('btn-restore').addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.restoreMainWindow) {
                window.electronAPI.restoreMainWindow();
            }
        });

        // Cancel button action (cancel active timer and restore main app)
        document.getElementById('btn-cancel').addEventListener('click', async () => {
            if (window.electronAPI && window.electronAPI.cancelAction) {
                const res = await window.electronAPI.cancelAction();
                // WBS-11.2: PIN korumalıysa mini pencerede sorulamaz — ana pencere açılır.
                if (res && res.success === false && window.electronAPI.restoreMainWindow) {
                    window.electronAPI.restoreMainWindow();
                }
            }
        });
    