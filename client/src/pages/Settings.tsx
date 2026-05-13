import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settingsStore';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { darkChess, ui, setDarkChessSetting, setUISetting, resetToDefaults } = useSettingsStore();

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 max-w-md w-full">
        <h1 className="text-3xl sm:text-4xl font-bold text-center text-amber-900 mb-8">
          遊戲設定
        </h1>

        <div className="space-y-8">
          {/* Dark Chess Rules */}
          <div>
            <h2 className="text-xl font-bold text-amber-800 mb-4 border-b border-amber-200 pb-2">
              暗棋規則
            </h2>
            
            {/* Rook Capture Range */}
            <div className="mb-4">
              <label className="block text-base font-semibold text-gray-700 mb-2">
                車吃子範圍
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    darkChess.rookCaptureRange === 'adjacent'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setDarkChessSetting('rookCaptureRange', 'adjacent')}
                >
                  僅吃相鄰
                </button>
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    darkChess.rookCaptureRange === 'fullLine'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setDarkChessSetting('rookCaptureRange', 'fullLine')}
                >
                  直線全範圍
                </button>
              </div>
            </div>

            {/* Cannon Capture Rule */}
            <div className="mb-4">
              <label className="block text-base font-semibold text-gray-700 mb-2">
                砲吃子規則
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    darkChess.cannonCaptureRule === 'needJump'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setDarkChessSetting('cannonCaptureRule', 'needJump')}
                >
                  需翻山
                </button>
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    darkChess.cannonCaptureRule === 'direct'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setDarkChessSetting('cannonCaptureRule', 'direct')}
                >
                  可直接吃
                </button>
              </div>
            </div>

            {/* Soldier Kill General */}
            <div className="mb-4">
              <label className="block text-base font-semibold text-gray-700 mb-2">
                兵吃將
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    darkChess.soldierKillGeneral
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setDarkChessSetting('soldierKillGeneral', true)}
                >
                  允許
                </button>
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    !darkChess.soldierKillGeneral
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setDarkChessSetting('soldierKillGeneral', false)}
                >
                  不允許
                </button>
              </div>
            </div>
          </div>

          {/* UI Settings */}
          <div>
            <h2 className="text-xl font-bold text-amber-800 mb-4 border-b border-amber-200 pb-2">
              顯示設定
            </h2>
            
            {/* Large Font */}
            <div className="mb-4">
              <label className="block text-base font-semibold text-gray-700 mb-2">
                大字體模式
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    ui.largeFont
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setUISetting('largeFont', true)}
                >
                  開啟
                </button>
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    !ui.largeFont
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setUISetting('largeFont', false)}
                >
                  關閉
                </button>
              </div>
            </div>

            {/* Sound Effects */}
            <div className="mb-4">
              <label className="block text-base font-semibold text-gray-700 mb-2">
                音效
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    ui.soundEnabled
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setUISetting('soundEnabled', true)}
                >
                  開啟
                </button>
                <button
                  className={`py-3 px-4 rounded-lg text-base font-semibold transition-all ${
                    !ui.soundEnabled
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  onClick={() => setUISetting('soundEnabled', false)}
                >
                  關閉
                </button>
              </div>
            </div>
          </div>

          {/* Reset Button */}
          <button
            className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white text-lg font-bold rounded-xl transition-all hover:scale-105"
            onClick={resetToDefaults}
          >
            恢復預設設定
          </button>

          {/* Back Button */}
          <button
            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white text-2xl font-bold rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95"
            onClick={() => navigate('/')}
          >
            返回主選單
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
