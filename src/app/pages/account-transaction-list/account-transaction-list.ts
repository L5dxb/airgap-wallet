import { Component } from '@angular/core'
import { ExchangeProvider } from './../../services/exchange/exchange'
import { HttpClient } from '@angular/common/http'
import { ActivatedRoute, Router } from '@angular/router'
import { AlertController, Platform, PopoverController, ToastController, NavController } from '@ionic/angular'
import { TranslateService } from '@ngx-translate/core'
import { AirGapMarketWallet, IAirGapTransaction, TezosKtProtocol, ICoinDelegateProtocol } from 'airgap-coin-lib'
import { Action } from 'airgap-coin-lib/dist/actions/Action'
import { BigNumber } from 'bignumber.js'

import { AccountEditPopoverComponent } from '../../components/account-edit-popover/account-edit-popover.component'
import { promiseTimeout } from '../../helpers/promise-timeout'
import { ActionGroup } from '../../models/ActionGroup'
import { AirGapTezosMigrateAction } from '../../models/actions/TezosMigrateAction'
import { AccountProvider } from '../../services/account/account.provider'
import { DataService, DataServiceKey } from '../../services/data/data.service'
import { OperationsProvider } from '../../services/operations/operations'
import { ProtocolSymbols } from '../../services/protocols/protocols'
import { PushBackendProvider } from '../../services/push-backend/push-backend'
import { ErrorCategory, handleErrorSentry } from '../../services/sentry-error-handler/sentry-error-handler'
import { SettingsKey, StorageProvider } from '../../services/storage/storage'
import { supportsDelegation } from 'src/app/helpers/delegation'
import { timer, Subscription } from 'rxjs'
import { ExtensionsService } from 'src/app/services/extensions/extensions.service'
import { UIAccountExtendedDetails } from 'src/app/models/widgets/display/UIAccountExtendedDetails'

declare let cordova
export const refreshRate = 3000

@Component({
  selector: 'page-account-transaction-list',
  templateUrl: 'account-transaction-list.html',
  styleUrls: ['./account-transaction-list.scss']
})
export class AccountTransactionListPage {
  private timer$ = timer(0, refreshRate)
  private subscription: Subscription = new Subscription()

  public isRefreshing: boolean = false
  public initialTransactionsLoaded: boolean = false
  public infiniteEnabled: boolean = false
  public showLinkToBlockExplorer: boolean = false

  public txOffset: number = 0
  public wallet: AirGapMarketWallet
  public mainWallet?: AirGapMarketWallet

  public transactions: IAirGapTransaction[] = []

  public protocolIdentifier: string

  public hasPendingTransactions: boolean = false
  public hasExchangeTransactions: boolean = false

  public pendingTransactions: IAirGapTransaction[] = []
  public formattedExchangeTransactions: IAirGapTransaction[] = []

  public accountExtendedDetails: UIAccountExtendedDetails

  // XTZ
  public isKtDelegated: boolean = false

  public actions: Action<any, any>[]

  public lottieConfig: { path: string } = {
    path: '/assets/animations/loading.json'
  }

  private readonly TRANSACTION_LIMIT: number = 10
  private readonly actionGroup: ActionGroup

  private readonly walletChanged: Subscription

  constructor(
    public readonly alertCtrl: AlertController,
    public readonly navController: NavController,
    public readonly router: Router,
    public readonly translateService: TranslateService,
    public readonly operationsProvider: OperationsProvider,
    public readonly popoverCtrl: PopoverController,
    public readonly accountProvider: AccountProvider,
    public readonly http: HttpClient,
    public readonly dataService: DataService,
    private readonly route: ActivatedRoute,
    private readonly platform: Platform,
    private readonly storageProvider: StorageProvider,
    private readonly toastController: ToastController,
    private readonly pushBackendProvider: PushBackendProvider,
    private readonly exchangeProvider: ExchangeProvider,
    private readonly extensionsService: ExtensionsService
  ) {
    const info = this.route.snapshot.data.special
    if (this.route.snapshot.data.special) {
      this.wallet = info.wallet
    }

    this.updateExtendedDetails()
    this.walletChanged = accountProvider.walletChangedObservable.subscribe(() => {
      this.updateExtendedDetails()
    })

    this.subscription = this.timer$.subscribe(async () => {
      if (this.formattedExchangeTransactions.length > 0) {
        this.formattedExchangeTransactions = await this.exchangeProvider.getExchangeTransactionsByProtocol(
          this.wallet.protocolIdentifier,
          this.wallet.addresses[0]
        )
        this.hasExchangeTransactions = this.formattedExchangeTransactions.length > 0
      }
    })

    this.protocolIdentifier = this.wallet.coinProtocol.identifier

    if (this.protocolIdentifier === ProtocolSymbols.XTZ_KT) {
      this.mainWallet = info.mainWallet
      this.isDelegated().catch(handleErrorSentry(ErrorCategory.COINLIB))
    }
    if (this.protocolIdentifier === ProtocolSymbols.XTZ) {
      this.getKtAddresses().catch(handleErrorSentry(ErrorCategory.COINLIB))
      this.isDelegated().catch(handleErrorSentry(ErrorCategory.COINLIB))
    }

    this.actionGroup = new ActionGroup(this)
    this.actions = this.actionGroup.getActions()

    this.init()
  }

  public async init(): Promise<void> {
    const lastTx: {
      protocol: string
      accountIdentifier: string
      date: number
    } = await this.storageProvider.get(SettingsKey.LAST_TX_BROADCAST)

    if (
      lastTx &&
      lastTx.protocol === this.wallet.protocolIdentifier &&
      lastTx.accountIdentifier === this.wallet.publicKey.substr(-6) &&
      lastTx.date > new Date().getTime() - 5 * 60 * 1000
    ) {
      this.hasPendingTransactions = true
    }
  }

  public showNoTransactionScreen(): boolean {
    return this.transactions.length === 0
  }

  public ionViewWillEnter(): void {
    this.doRefresh()
  }

  public openPreparePage() {
    let info
    if (this.protocolIdentifier === ProtocolSymbols.XTZ_KT) {
      const action = new AirGapTezosMigrateAction({
        wallet: this.wallet,
        mainWallet: this.mainWallet,
        alertCtrl: this.alertCtrl,
        translateService: this.translateService,
        dataService: this.dataService,
        router: this.router
      })
      action.start()
      return
    } else if (this.protocolIdentifier === ProtocolSymbols.TZBTC) {
      info = {
        wallet: this.wallet,
        address: '',
        disableFees: true
      }
    } else {
      info = {
        wallet: this.wallet,
        address: ''
      }
    }
    this.dataService.setData(DataServiceKey.DETAIL, info)
    this.router.navigateByUrl('/transaction-prepare/' + DataServiceKey.DETAIL).catch(handleErrorSentry(ErrorCategory.NAVIGATION))
  }

  public openReceivePage(): void {
    this.dataService.setData(DataServiceKey.DETAIL, this.wallet)
    this.router.navigateByUrl('/account-address/' + DataServiceKey.DETAIL).catch(handleErrorSentry(ErrorCategory.NAVIGATION))
  }

  public openTransactionDetailPage(transaction: IAirGapTransaction): void {
    this.dataService.setData(DataServiceKey.DETAIL, transaction)
    this.router.navigateByUrl('/transaction-detail/' + DataServiceKey.DETAIL).catch(handleErrorSentry(ErrorCategory.NAVIGATION))
  }

  public async openBlockexplorer(): Promise<void> {
    const blockexplorer = await this.wallet.coinProtocol.getBlockExplorerLinkForAddress(this.wallet.addresses[0])

    this.openUrl(blockexplorer)
  }

  private openUrl(url: string): void {
    if (this.platform.is('ios') || this.platform.is('android')) {
      cordova.InAppBrowser.open(url, '_system', 'location=true')
    } else {
      window.open(url, '_blank')
    }
  }

  public doRefresh(event: any = null): void {
    if (supportsDelegation(this.wallet.coinProtocol)) {
      this.operationsProvider.refreshAllDelegationStatuses([this.wallet])
    }

    this.isRefreshing = true

    if (event) {
      event.target.complete()
    }

    this.loadInitialTransactions().catch(handleErrorSentry())
  }

  public async doInfinite(event): Promise<void> {
    if (!this.infiniteEnabled) {
      return event.target.complete()
    }

    const offset: number = this.txOffset - (this.txOffset % this.TRANSACTION_LIMIT)
    const newTransactions: IAirGapTransaction[] = await this.getTransactions(this.TRANSACTION_LIMIT, offset)

    this.transactions = this.mergeTransactions(this.transactions, newTransactions)
    this.txOffset = this.transactions.length

    await this.storageProvider.setCache<IAirGapTransaction[]>(this.accountProvider.getAccountIdentifier(this.wallet), this.transactions)

    if (newTransactions.length < this.TRANSACTION_LIMIT) {
      this.infiniteEnabled = false
    }

    event.target.complete()
  }

  public async loadInitialTransactions(): Promise<void> {
    if (this.transactions.length === 0) {
      this.transactions =
        (await this.storageProvider.getCache<IAirGapTransaction[]>(this.accountProvider.getAccountIdentifier(this.wallet))) || []
    }

    const transactionPromise: Promise<IAirGapTransaction[]> = this.getTransactions()

    const transactions: IAirGapTransaction[] = await promiseTimeout(10000, transactionPromise).catch(() => {
      // either the txs are taking too long to load or there is actually a network error
      this.showLinkToBlockExplorer = true
      return []
    })

    this.transactions = this.mergeTransactions(this.transactions, transactions)

    this.isRefreshing = false
    this.initialTransactionsLoaded = true

    const addr: string = this.wallet.receivingPublicAddress

    this.pendingTransactions = (await this.pushBackendProvider.getPendingTxs(addr, this.protocolIdentifier)) as IAirGapTransaction[]

    this.formattedExchangeTransactions = await this.exchangeProvider.getExchangeTransactionsByProtocol(
      this.wallet.protocolIdentifier,
      this.wallet.addresses[0]
    )
    this.hasExchangeTransactions = this.formattedExchangeTransactions.length > 0

    // remove duplicates from pendingTransactions
    const txHashes: string[] = this.transactions.map(value => value.hash)
    this.pendingTransactions = this.pendingTransactions.filter(value => {
      return txHashes.indexOf(value.hash) === -1
    })

    if (this.pendingTransactions.length > 0) {
      this.pendingTransactions = this.pendingTransactions.map(pendingTx => {
        pendingTx.fee = new BigNumber(pendingTx.fee).toString(10)
        pendingTx.amount = new BigNumber(pendingTx.amount).toString(10)

        return pendingTx
      })
      this.hasPendingTransactions = true
    } else {
      this.hasPendingTransactions = false
    }

    this.accountProvider.triggerWalletChanged()
    await this.storageProvider.setCache<IAirGapTransaction[]>(this.accountProvider.getAccountIdentifier(this.wallet), this.transactions)
    this.txOffset = this.transactions.length

    this.infiniteEnabled = true
  }

  public async getTransactions(limit: number = 10, offset: number = 0): Promise<IAirGapTransaction[]> {
    const [transactions]: [IAirGapTransaction[], void] = await Promise.all([
      this.wallet.fetchTransactions(limit, offset),
      this.wallet.synchronize().catch(error => {
        console.error(error)
      })
    ])

    return transactions
  }

  public mergeTransactions(oldTransactions: IAirGapTransaction[], newTransactions: IAirGapTransaction[]): IAirGapTransaction[] {
    if (!oldTransactions) {
      return newTransactions
    }
    const transactionMap: Map<string, IAirGapTransaction> = new Map<string, IAirGapTransaction>(
      oldTransactions.map((tx: IAirGapTransaction): [string, IAirGapTransaction] => [tx.hash, tx])
    )

    newTransactions.forEach(tx => {
      transactionMap.set(tx.hash, tx)
    })

    return Array.from(transactionMap.values()).sort((a, b) =>
      a.timestamp !== undefined && b.timestamp !== undefined
        ? b.timestamp - a.timestamp
        : new BigNumber(b.blockHeight).minus(new BigNumber(a.blockHeight)).toNumber()
    )
  }

  public async presentEditPopover(event): Promise<void> {
    const popover = await this.popoverCtrl.create({
      component: AccountEditPopoverComponent,
      componentProps: {
        wallet: this.wallet,
        importAccountAction: this.wallet.protocolIdentifier === 'xtz' ? this.actionGroup.getImportAccountsAction() : undefined,
        onDelete: (): void => {
          this.navController.pop()
        }
      },
      event,
      translucent: true
    })

    return popover.present().catch(handleErrorSentry(ErrorCategory.NAVIGATION))
  }

  // Tezos
  public async isDelegated(): Promise<void> {
    const isDelegated = await this.operationsProvider.checkDelegated(
      this.wallet.coinProtocol as ICoinDelegateProtocol,
      this.wallet.receivingPublicAddress
    )
    this.isKtDelegated = isDelegated
    // const action = isDelegated ? this.getStatusAction() : this.getDelegateAction()
    // this.replaceAction(ActionType.DELEGATE, action)
  }

  public async getKtAddresses(): Promise<string[]> {
    const protocol: TezosKtProtocol = new TezosKtProtocol()
    const ktAddresses: string[] = await protocol.getAddressesFromPublicKey(this.wallet.publicKey)
    // const action = ktAddresses.length > 0 ? this.getStatusAction(ktAddresses) : this.getDelegateAction()
    // this.replaceAction(ActionType.DELEGATE, action)

    return ktAddresses
  }

  public async openDelegationDetails(): Promise<void> {
    const delegateAction = this.actions.find(action => action.identifier === 'delegate-action')
    if (delegateAction) {
      await delegateAction.start()
    }
  }

  public async showToast(message: string): Promise<void> {
    const toast: HTMLIonToastElement = await this.toastController.create({
      duration: 3000,
      message,
      buttons: [
        {
          text: 'Ok',
          role: 'cancel'
        }
      ],
      position: 'bottom'
    })
    toast.present().catch(handleErrorSentry(ErrorCategory.NAVIGATION))
  }

  private updateExtendedDetails() {
    if (supportsDelegation(this.wallet.coinProtocol) && this.wallet.receivingPublicAddress !== undefined) {
      this.extensionsService.loadDelegationExtensions().then(async () => {
        this.accountExtendedDetails = await this.operationsProvider.getAccountExtendedDetails(this.wallet)
      })
    }
  }

  public ngOnDestroy(): void {
    this.subscription.unsubscribe()
    this.walletChanged.unsubscribe()
  }
}
