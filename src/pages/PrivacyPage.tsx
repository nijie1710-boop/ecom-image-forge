import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";

const EFFECTIVE_DATE = "2026 年 4 月 14 日";

const PrivacyPage = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4 md:px-6">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <img src={logo} alt="PicSpark AI" className="h-6 w-6 rounded-lg object-contain" />
            <span className="text-sm font-bold">PicSpark AI</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-16">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-foreground">隐私政策</h1>
        <p className="mb-10 text-sm text-muted-foreground">生效日期：{EFFECTIVE_DATE}</p>

        <article className="prose-custom space-y-8 text-[15px] leading-relaxed text-foreground/85">
          {/* 1 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">一、引言</h2>
            <p>
              PicSpark AI（以下简称"本平台"）非常重视用户的隐私保护。本隐私政策旨在向您说明我们如何收集、使用、存储和保护您的个人信息。请您在使用本平台服务前仔细阅读本政策。使用本平台即表示您同意本政策的内容。
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">二、我们收集的信息</h2>
            <p>为向您提供服务，我们可能收集以下信息：</p>

            <h3 className="mb-2 mt-4 text-base font-semibold text-foreground">2.1 您主动提供的信息</h3>
            <ul className="ml-4 list-disc space-y-1 pl-2">
              <li><strong>账号信息</strong>：注册时提供的邮箱地址、昵称、密码（加密存储）；</li>
              <li><strong>上传内容</strong>：您上传至平台用于 AI 处理的商品图片及相关素材；</li>
              <li><strong>充值信息</strong>：充值时的订单信息（我们不直接存储您的支付账号信息，支付由第三方支付平台处理）。</li>
            </ul>

            <h3 className="mb-2 mt-4 text-base font-semibold text-foreground">2.2 自动收集的信息</h3>
            <ul className="ml-4 list-disc space-y-1 pl-2">
              <li><strong>设备信息</strong>：浏览器类型、操作系统版本、设备标识等；</li>
              <li><strong>日志信息</strong>：访问时间、页面浏览记录、IP 地址、请求来源等；</li>
              <li><strong>使用数据</strong>：功能使用频次、生成任务记录、积分消费记录。</li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">三、信息使用目的</h2>
            <p>我们收集的信息将用于以下目的：</p>
            <ul className="ml-4 mt-2 list-disc space-y-1 pl-2">
              <li>提供、维护和改进平台服务；</li>
              <li>处理您的充值订单和积分管理；</li>
              <li>向您发送服务通知、系统公告和安全提醒；</li>
              <li>分析使用趋势以优化产品体验；</li>
              <li>识别并防范安全风险、欺诈行为或违规使用；</li>
              <li>遵守适用的法律法规或响应合法的司法请求。</li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">四、信息存储与保护</h2>
            <ol className="ml-4 list-decimal space-y-2 pl-2">
              <li>
                <strong>存储地点</strong>：您的个人信息存储在位于中华人民共和国境内的服务器上。如未来因业务需要进行跨境传输，我们将严格遵循相关法律法规并事先征得您的同意。
              </li>
              <li>
                <strong>存储期限</strong>：我们仅在实现服务目的所需的最短期限内保留您的个人信息。账号注销后，我们将在合理期限内删除或匿名化处理您的个人信息，法律法规另有要求的除外。
              </li>
              <li>
                <strong>安全措施</strong>：我们采取了行业标准的安全措施来保护您的数据，包括但不限于：
                <ul className="ml-4 mt-1 list-disc space-y-1 pl-2">
                  <li>全站 HTTPS 加密传输；</li>
                  <li>密码使用 bcrypt 等算法加密存储；</li>
                  <li>数据库访问权限控制和审计日志；</li>
                  <li>定期安全评估与漏洞修复。</li>
                </ul>
              </li>
            </ol>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">五、信息共享与披露</h2>
            <p>我们不会将您的个人信息出售给任何第三方。在以下情况下，我们可能会共享您的信息：</p>
            <ul className="ml-4 mt-2 list-disc space-y-1 pl-2">
              <li><strong>第三方支付</strong>：充值交易过程中，必要的订单信息会传递给支付宝等支付服务提供商，以完成支付处理；</li>
              <li><strong>法律要求</strong>：当法律法规要求或政府机关依法提出披露要求时；</li>
              <li><strong>安全保护</strong>：为保护本平台、其他用户或公众的合法权益而合理必要时；</li>
              <li><strong>业务合作</strong>：与我们的技术服务提供商共享（如云服务、AI 模型提供商），这些合作方受到严格的数据保护协议约束。</li>
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">六、用户上传图片的处理</h2>
            <ol className="ml-4 list-decimal space-y-2 pl-2">
              <li>您上传的图片将被发送至 AI 模型进行处理，处理完成后的结果图片将存储在您的账号下。</li>
              <li>我们不会将您上传的图片用于训练 AI 模型或任何其他目的，仅用于完成您请求的图像生成任务。</li>
              <li>您可以随时在"我的图库"中删除已生成的图片。</li>
            </ol>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">七、Cookie 和类似技术</h2>
            <p>
              我们使用 Cookie 和类似技术来维持您的登录状态、记住偏好设置（如主题和语言）以及分析平台使用情况。您可以通过浏览器设置管理或删除 Cookie，但这可能影响您正常使用部分功能。
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">八、您的权利</h2>
            <p>根据适用的法律法规，您享有以下权利：</p>
            <ul className="ml-4 mt-2 list-disc space-y-1 pl-2">
              <li><strong>访问权</strong>：您有权查阅我们持有的关于您的个人信息；</li>
              <li><strong>更正权</strong>：您可通过账号设置页面更新您的个人信息；</li>
              <li><strong>删除权</strong>：您可请求我们删除您的个人信息（法律法规另有规定的除外）；</li>
              <li><strong>注销权</strong>：您有权注销您的账号，注销后我们将按本政策规定处理您的数据；</li>
              <li><strong>撤回同意权</strong>：您可随时撤回对我们处理您个人信息的同意，但不影响撤回前的处理行为的合法性。</li>
            </ul>
            <p className="mt-2">
              如需行使上述权利，请通过本政策末尾的联系方式与我们联系。我们将在 15 个工作日内响应您的请求。
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">九、未成年人保护</h2>
            <p>
              本平台的服务对象为具有完全民事行为能力的成年人。如果您是未满 18 周岁的未成年人，请在法定监护人的陪同和同意下使用本平台。我们不会故意收集未成年人的个人信息。
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">十、隐私政策更新</h2>
            <p>
              我们可能会不定期更新本隐私政策。更新后的版本将发布在本页面上并标注新的生效日期。对于重大变更，我们将通过平台内通知或邮件方式告知您。建议您定期查阅本政策以了解最新内容。
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">十一、联系我们</h2>
            <p>
              如您对本隐私政策有任何疑问、意见或投诉，请通过以下方式联系我们：
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1 pl-2">
              <li>邮箱：support@picspark.cn</li>
            </ul>
          </section>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        <div className="container mx-auto px-4">
          <p>© 2026 PicSpark AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPage;
