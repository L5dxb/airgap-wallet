import { Action } from 'airgap-coin-lib/dist/actions/Action'
import { ImportAccountAction, ImportAccoutActionContext } from 'airgap-coin-lib/dist/actions/GetKtAccountsAction'
import { LinkedAction } from 'airgap-coin-lib/dist/actions/LinkedAction'
import { SimpleAction } from 'airgap-coin-lib/dist/actions/SimpleAction'
import { SubProtocolType } from 'airgap-coin-lib/dist/protocols/ICoinSubProtocol'

import { AccountTransactionListPage } from '../pages/account-transaction-list/account-transaction-list'
import { DataServiceKey } from '../services/data/data.service'
import { ProtocolSymbols } from '../services/protocols/protocols'
import { ErrorCategory, handleErrorSentry } from '../services/sentry-error-handler/sentry-error-handler'

import { AddTokenAction, AddTokenActionContext } from './actions/AddTokenAction'
import { ButtonAction } from './actions/ButtonAction'
import { AirGapTezosMigrateAction, AirGapTezosMigrateActionContext } from './actions/TezosMigrateAction'

export interface WalletActionInfo {
  name: string
  icon: string
}

export class ActionGroup {
  constructor(private readonly callerContext: AccountTransactionListPage) {}

  public getActions(): Action<any, any>[] {
    const actionMap: Map<string, () => Action<any, any>[]> = new Map()
    actionMap.set(ProtocolSymbols.XTZ, () => {
      return this.getTezosActions()
    })
    actionMap.set(ProtocolSymbols.XTZ_KT, () => {
      return this.getTezosKTActions()
    })
    actionMap.set(ProtocolSymbols.ETH, () => {
      return this.getEthereumActions()
    })
    actionMap.set(ProtocolSymbols.COSMOS, () => {
      return this.getCosmosActions()
    })
    actionMap.set(ProtocolSymbols.POLKADOT, () => {
      return this.getPolkadotActions()
    })
    actionMap.set(ProtocolSymbols.KUSAMA, () => {
      return this.getKusamaActions()
    })

    const actionFunction: () => Action<any, any>[] | undefined = actionMap.get(this.callerContext.protocolIdentifier)

    return actionFunction ? actionFunction() : []
  }

  private getTezosActions(): Action<any, any>[] {
    const delegateButtonAction = this.createDelegateButtonAction()

    const addTokenButtonAction = new ButtonAction(
      { name: 'account-transaction-list.add-tokens_label', icon: 'add', identifier: 'add-tokens' },
      () => {
        const prepareAddTokenActionContext = new SimpleAction(() => {
          return new Promise<AddTokenActionContext>(async resolve => {
            const info = {
              subProtocolType: SubProtocolType.TOKEN,
              wallet: this.callerContext.wallet,
              actionCallback: resolve
            }
            this.callerContext.dataService.setData(DataServiceKey.DETAIL, info)
            this.callerContext.router
              .navigateByUrl('/sub-account-add/' + DataServiceKey.DETAIL)
              .catch(handleErrorSentry(ErrorCategory.NAVIGATION))
          })
        })
        const addTokenAction = new LinkedAction(prepareAddTokenActionContext, AddTokenAction)
        addTokenAction.onComplete = async (): Promise<void> => {
          addTokenAction.getLinkedAction().context.location.back()
        }

        return addTokenAction
      }
    )

    return [delegateButtonAction, addTokenButtonAction]
  }

  public getImportAccountsAction(): ButtonAction<string[], ImportAccoutActionContext> {
    const importButtonAction: ButtonAction<string[], ImportAccoutActionContext> = new ButtonAction(
      { name: 'account-transaction-list.import-accounts_label', icon: 'add-outline', identifier: 'import-accounts' },
      () => {
        const importAccountAction: ImportAccountAction = new ImportAccountAction({ publicKey: this.callerContext.wallet.publicKey })
        importAccountAction.onComplete = async (ktAddresses: string[]): Promise<void> => {
          if (ktAddresses.length === 0) {
            this.callerContext.showToast('No accounts to import.')
          } else {
            for (const [index] of ktAddresses.entries()) {
              await this.callerContext.operationsProvider.addKtAddress(this.callerContext.wallet, index, ktAddresses)
            }

            this.callerContext.router.navigateByUrl('/').catch(handleErrorSentry(ErrorCategory.NAVIGATION))
            this.callerContext.showToast('Accounts imported')
          }
        }
        return importAccountAction
      }
    )
    return importButtonAction
  }

  private getTezosKTActions(): Action<any, any>[] {
    const migrateAction = new ButtonAction<void, AirGapTezosMigrateActionContext>(
      { name: 'account-transaction-list.migrate_label', icon: 'return-down-back-outline', identifier: 'migrate-action' },
      () => {
        return new AirGapTezosMigrateAction({
          wallet: this.callerContext.wallet,
          mainWallet: this.callerContext.mainWallet,
          alertCtrl: this.callerContext.alertCtrl,
          translateService: this.callerContext.translateService,
          dataService: this.callerContext.dataService,
          router: this.callerContext.router
        })
      }
    )
    return [migrateAction]
  }

  private getCosmosActions(): Action<any, any>[] {
    const delegateButtonAction = this.createDelegateButtonAction()

    return [delegateButtonAction]
  }

  private getEthereumActions(): Action<any, any>[] {
    const addTokenButtonAction: ButtonAction<void, void> = new ButtonAction(
      { name: 'account-transaction-list.add-tokens_label', icon: 'add-outline', identifier: 'add-tokens' },
      () => {
        const prepareAddTokenActionContext: SimpleAction<AddTokenActionContext> = new SimpleAction(() => {
          return new Promise<AddTokenActionContext>(async resolve => {
            const info = {
              subProtocolType: SubProtocolType.TOKEN,
              wallet: this.callerContext.wallet,
              actionCallback: resolve
            }
            this.callerContext.dataService.setData(DataServiceKey.DETAIL, info)
            this.callerContext.router
              .navigateByUrl('/sub-account-add/' + DataServiceKey.DETAIL)
              .catch(handleErrorSentry(ErrorCategory.NAVIGATION))
          })
        })
        const addTokenAction: LinkedAction<void, AddTokenActionContext> = new LinkedAction(prepareAddTokenActionContext, AddTokenAction)
        addTokenAction.onComplete = async (): Promise<void> => {
          addTokenAction.getLinkedAction().context.location.back()
        }

        return addTokenAction
      }
    )

    return [addTokenButtonAction]
  }

  private getPolkadotActions(): Action<any, any>[] {
    const delegateButtonAction = this.createDelegateButtonAction()

    return [delegateButtonAction]
  }

  private getKusamaActions(): Action<any, any>[] {
    const delegateButtonAction = this.createDelegateButtonAction()

    return [delegateButtonAction]
  }

  private createDelegateButtonAction(): ButtonAction<void, void> {
    return new ButtonAction({ name: 'account-transaction-list.delegate_label', icon: 'logo-usd', identifier: 'delegate-action' }, () => {
      return new SimpleAction(() => {
        return new Promise<void>(resolve => {
          const info = {
            wallet: this.callerContext.wallet
          }
          this.callerContext.dataService.setData(DataServiceKey.DETAIL, info)
          this.callerContext.router
            .navigateByUrl('/delegation-detail/' + DataServiceKey.DETAIL)
            .catch(handleErrorSentry(ErrorCategory.NAVIGATION))

          resolve()
        })
      })
    })
  }
}
